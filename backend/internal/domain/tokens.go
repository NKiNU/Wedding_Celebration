package domain

// AddToken returns a new list with token as the newest entry; the oldest falls off past MaxNamesPerPhone.
func AddToken(tokens []string, token string) []string {
	out := make([]string, 0, len(tokens)+1)
	for _, t := range tokens {
		if t != token {
			out = append(out, t)
		}
	}
	out = append(out, token)
	if len(out) > MaxNamesPerPhone {
		out = out[len(out)-MaxNamesPerPhone:]
	}
	return out
}
