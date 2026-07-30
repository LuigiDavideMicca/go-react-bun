package api

import (
	"context"
	"errors"
	"net/http"
	"sync"

	"github.com/LuigiDavideMicca/borgo"
)

type User struct {
	Username string
	Hash     string
}

// the session stores only the username - the minimal principal
type Me struct {
	Username string `json:"username"`
}

// in-memory user store; replace Lookup/Register with real persistence and
// everything else (sessions, csrf, the /api/me guard) keeps working
var (
	usersMu sync.RWMutex
	users   = map[string]User{}
)

var auth = borgo.Auth[User]{
	Lookup: func(ctx context.Context, username string) (User, string, error) {
		usersMu.RLock()
		user, ok := users[username]
		usersMu.RUnlock()
		if !ok {
			return User{}, "", errors.New("user not found")
		}
		return user, user.Hash, nil
	},
	Register: func(ctx context.Context, username, hash string) (User, error) {
		usersMu.Lock()
		defer usersMu.Unlock()
		if _, ok := users[username]; ok {
			return User{}, borgo.ErrUserExists
		}
		user := User{Username: username, Hash: hash}
		users[username] = user
		return user, nil
	},
	Principal: func(u User) any { return Me{Username: u.Username} },
}

func currentUser(w http.ResponseWriter, r *http.Request) {
	me, ok := borgo.GetSession[Me](r)
	if !ok {
		// unreachable behind Authed; plain text keeps the generated type clean
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}
	borgo.JSON(w, http.StatusOK, me)
}

func init() {
	borgo.Handle("POST /api/login", auth.LoginHandler)
	borgo.Handle("POST /api/logout", auth.LogoutHandler)
	borgo.Handle("POST /api/register", auth.RegisterHandler)
	borgo.Handle("GET /api/me", borgo.Authed(currentUser))
}
