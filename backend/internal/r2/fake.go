package r2

import (
	"context"
	"errors"
	"strings"
	"sync"
)

// FakeObject is an object "uploaded" to a Fake. Start defaults to the signature of its type.
type FakeObject struct {
	Bytes      int64
	Mime       string
	Overridden bool
	Start      []byte
	Body       []byte
}

// Presigned is one PresignPut call a Fake saw.
type Presigned struct {
	Key   string
	Mime  string
	Bytes int64
}

// Fake is an in-memory R2 for service tests (port of tests/fixtures/r2.ts): tests list the
// objects uploaded so far and read back what was presigned and deleted.
type Fake struct {
	mu         sync.Mutex
	Objects    map[string]FakeObject
	Presigned  []Presigned
	Deleted    []string
	Purged     []string
	PresignErr error // when set, every PresignPut fails
	DeleteErr  error // when set, every DeleteMany fails
	// OnHead runs before each Head, outside the lock: a test changes the database mid-post with it.
	OnHead func(key string)
}

var signature = map[string][]byte{
	"image/jpeg":      {0xff, 0xd8, 0xff, 0xe0},
	"image/png":       {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a},
	"video/mp4":       {0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70}, // "ftyp" at offset 4
	"video/quicktime": {0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70},
	"video/webm":      {0x1a, 0x45, 0xdf, 0xa3},
}

func NewFake(objects map[string]FakeObject) *Fake {
	if objects == nil {
		objects = map[string]FakeObject{}
	}
	return &Fake{Objects: objects}
}

func (f *Fake) PresignPut(_ context.Context, key, mime string, bytes int64) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.PresignErr != nil {
		return "", f.PresignErr
	}
	f.Presigned = append(f.Presigned, Presigned{key, mime, bytes})
	return "https://r2.test/" + key, nil
}

func (f *Fake) Head(_ context.Context, key string) (*Object, error) {
	if f.OnHead != nil {
		f.OnHead(key)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	o, found := f.Objects[key]
	if !found {
		return nil, nil
	}
	return &Object{Bytes: o.Bytes, Mime: o.Mime, Overridden: o.Overridden}, nil
}

func (f *Fake) Peek(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, found := f.Objects[key]
	if !found {
		return nil, false, nil
	}
	if o.Start != nil {
		return o.Start, true, nil
	}
	sig, known := signature[strings.ToLower(strings.TrimSpace(strings.Split(o.Mime, ";")[0]))]
	if !known {
		sig = []byte{0}
	}
	return append(append([]byte{}, sig...), make([]byte, 8)...), true, nil
}

func (f *Fake) Read(_ context.Context, key string, maxBytes int64) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, found := f.Objects[key]
	if !found || o.Body == nil {
		return nil, false, nil
	}
	if int64(len(o.Body)) > maxBytes {
		return nil, false, errors.New("too large")
	}
	return o.Body, true, nil
}

func (f *Fake) DeleteMany(_ context.Context, keys []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.DeleteErr != nil {
		return f.DeleteErr
	}
	for _, k := range keys {
		f.Deleted = append(f.Deleted, k)
		delete(f.Objects, k)
	}
	return nil
}

func (f *Fake) Purge(_ context.Context, keys []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Purged = append(f.Purged, keys...)
	return nil
}
