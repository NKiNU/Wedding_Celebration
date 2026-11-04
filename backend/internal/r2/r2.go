// Package r2 is the port of src/server/r2.ts: the slice of R2 (S3 API, SigV4) the app uses.
package r2

import (
	"context"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"golang.org/x/sync/errgroup"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
)

// Object is the size and type of a stored object. Overridden is true when the uploader slipped in
// Content-Disposition or Content-Encoding (unsigned headers are stored and served back), which
// would let a guest name or re-encode what the media domain serves.
type Object struct {
	Bytes      int64
	Mime       string
	Overridden bool
}

// R2 is what the services depend on, so tests can swap in a Fake.
type R2 interface {
	// PresignPut is a URL that accepts a PUT of exactly `bytes` bytes of `mime` to `key`, for a few minutes.
	PresignPut(ctx context.Context, key, mime string, bytes int64) (string, error)
	// Head is the stored object, or nil when it does not exist.
	Head(ctx context.Context, key string) (*Object, error)
	// Peek is the first bytes of a stored object (at most PeekBytes); found is false when it does not exist.
	Peek(ctx context.Context, key string) (start []byte, found bool, err error)
	// Read is a whole small object; found is false when it does not exist. Fails when it is larger than maxBytes.
	Read(ctx context.Context, key string, maxBytes int64) (body []byte, found bool, err error)
	DeleteMany(ctx context.Context, keys []string) error
	// Purge asks the media domain's CDN to forget these keys, so a deleted photo stops being served
	// from cache. Called after DeleteMany; a failure is logged and never blocks the delete, but the
	// delete response waits for it, so an implementation must time out within a few seconds.
	Purge(ctx context.Context, keys []string) error
}

const PeekBytes = 16

// retries: aws4fetch retries 5xx up to 10 times by default; a request must not hang that long.
const retries = 1

// Config is the R2 part of the server's Env.
type Config struct {
	Endpoint        string // dev only: an S3-compatible endpoint instead of R2; empty means unset
	AccountID       string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	Region          string
}

// Client is the real R2.
type Client struct {
	cfg    Config
	signer *v4.Signer
	http   *http.Client
	now    func() time.Time // fixed in the presign golden test
}

// New builds the client. Compression is off so a stored Content-Encoding reaches Head, and bodies are raw bytes.
func New(cfg Config) *Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.DisableCompression = true
	return &Client{
		cfg: cfg,
		// S3 paths are escaped once, as aws4fetch does for service "s3".
		signer: v4.NewSigner(func(o *v4.SignerOptions) { o.DisableURIPathEscaping = true }),
		http:   &http.Client{Transport: t, Timeout: 20 * time.Second},
		now:    time.Now,
	}
}

func (c *Client) objectURL(key string) string {
	base := strings.TrimSuffix(c.cfg.Endpoint, "/") // one slash, like replace(/\/$/, "")
	if c.cfg.Endpoint == "" {
		base = "https://" + c.cfg.AccountID + ".r2.cloudflarestorage.com"
	}
	return base + "/" + c.cfg.Bucket + "/" + key
}

func (c *Client) creds() aws.Credentials {
	return aws.Credentials{AccessKeyID: c.cfg.AccessKeyID, SecretAccessKey: c.cfg.SecretAccessKey}
}

const unsignedPayload = "UNSIGNED-PAYLOAD"

// PresignPut signs content-type and content-length too, so R2 refuses any PUT whose type or size
// differs from what the intent declared.
func (c *Client) PresignPut(ctx context.Context, key, mime string, bytes int64) (string, error) {
	u := c.objectURL(key) + "?X-Amz-Expires=" + strconv.Itoa(int(domain.PresignExpires.Seconds()))
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mime)
	req.ContentLength = bytes // the signer signs content-length from here (only when > 0; bytes is always positive)
	signed, _, err := c.signer.PresignHTTP(ctx, c.creds(), req, unsignedPayload, "s3", c.cfg.Region, c.now())
	return signed, err
}

// do sends a signed request, retrying once on 5xx or 429 like aws4fetch.
func (c *Client) do(ctx context.Context, method, key string, header map[string]string) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, c.objectURL(key), nil)
		if err != nil {
			return nil, err
		}
		for k, v := range header {
			req.Header.Set(k, v)
		}
		req.Header.Set("X-Amz-Content-Sha256", unsignedPayload)
		if err := c.signer.SignHTTP(ctx, c.creds(), req, unsignedPayload, "s3", c.cfg.Region, c.now()); err != nil {
			return nil, err
		}
		res, err := c.http.Do(req)
		if err != nil || attempt == retries || (res.StatusCode < 500 && res.StatusCode != http.StatusTooManyRequests) {
			return res, err
		}
		discard(res)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(rand.N(50 * time.Millisecond)): // aws4fetch: random up to 50 ms before the one retry
		}
	}
}

func discard(res *http.Response) {
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	_ = res.Body.Close()
}

func ok(status int) bool { return status >= 200 && status < 300 }

func (c *Client) Head(ctx context.Context, key string) (*Object, error) {
	res, err := c.do(ctx, http.MethodHead, key, nil)
	if err != nil {
		return nil, err
	}
	discard(res)
	if res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if !ok(res.StatusCode) {
		return nil, fmt.Errorf("R2 HEAD %s failed: %d", key, res.StatusCode)
	}
	_, disposition := res.Header["Content-Disposition"]
	_, encoding := res.Header["Content-Encoding"]
	// A missing length is -1 here (Number(null) is 0 in the TypeScript): neither matches a declared size.
	return &Object{Bytes: res.ContentLength, Mime: res.Header.Get("Content-Type"), Overridden: disposition || encoding}, nil
}

func (c *Client) Peek(ctx context.Context, key string) ([]byte, bool, error) {
	res, err := c.do(ctx, http.MethodGet, key, map[string]string{"Range": fmt.Sprintf("bytes=0-%d", PeekBytes-1)})
	if err != nil {
		return nil, false, err
	}
	defer discard(res)
	if res.StatusCode == http.StatusNotFound {
		return nil, false, nil
	}
	if !ok(res.StatusCode) {
		return nil, false, fmt.Errorf("R2 GET %s failed: %d", key, res.StatusCode)
	}
	if res.StatusCode != http.StatusPartialContent {
		// A store that ignored Range would send the whole file (a whole video): never read that.
		return nil, false, fmt.Errorf("R2 GET %s ignored the Range header", key)
	}
	start, err := io.ReadAll(io.LimitReader(res.Body, PeekBytes))
	return start, err == nil, err
}

func (c *Client) Read(ctx context.Context, key string, maxBytes int64) ([]byte, bool, error) {
	res, err := c.do(ctx, http.MethodGet, key, nil)
	if err != nil {
		return nil, false, err
	}
	defer discard(res)
	if res.StatusCode == http.StatusNotFound {
		return nil, false, nil
	}
	if !ok(res.StatusCode) {
		return nil, false, fmt.Errorf("R2 GET %s failed: %d", key, res.StatusCode)
	}
	tooBig := fmt.Errorf("R2 object %s is larger than %d bytes", key, maxBytes)
	if res.ContentLength > maxBytes {
		return nil, false, tooBig
	}
	// content-length can be missing (chunked), so also count while reading instead of trusting the header.
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(body)) > maxBytes {
		return nil, false, tooBig
	}
	return body, true, nil
}

func (c *Client) DeleteMany(ctx context.Context, keys []string) error {
	// ponytail: one DELETE per key; a post has at most 20. Use DeleteObjects past a few hundred.
	statuses := make([]int, len(keys))
	var g errgroup.Group
	for i, key := range keys {
		g.Go(func() error {
			res, err := c.do(ctx, http.MethodDelete, key, nil)
			if err != nil {
				return err
			}
			discard(res)
			statuses[i] = res.StatusCode
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return err
	}
	for i, s := range statuses {
		if !ok(s) && s != http.StatusNotFound {
			return fmt.Errorf("R2 DELETE %s failed: %d", keys[i], s)
		}
	}
	return nil
}

// PLACEHOLDER (the bucket and media domain are set up outside this repo; see docs/R2-SETUP.md,
// "Purge on delete"). Until the CDN has a purge API wired in here, deleted media can stay in the
// edge cache for as long as the `Cache-Control` set on the media domain allows. Replace this body
// with the CDN's "purge by URL" call for `${NEXT_PUBLIC_MEDIA_BASE_URL}/${key}`, with a timeout of a few seconds.
func (c *Client) Purge(context.Context, []string) error { return nil }
