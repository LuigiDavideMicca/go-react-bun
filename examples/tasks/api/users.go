package api

import (
	"context"
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
	"gorm.io/gorm"

	"tasks/db"
)

type User struct {
	gorm.Model
	Username string `gorm:"uniqueIndex" json:"username"`
	Hash     string `json:"-"`
}

// the session stores only the username - the minimal principal
type Me struct {
	Username string `json:"username"`
}

var auth = borgo.Auth[User]{
	Lookup: func(ctx context.Context, username string) (User, string, error) {
		var user User
		if err := db.DB.First(&user, "username = ?", username).Error; err != nil {
			return User{}, "", err
		}
		return user, user.Hash, nil
	},
	Register: func(ctx context.Context, username, hash string) (User, error) {
		var count int64
		db.DB.Model(&User{}).Where("username = ?", username).Count(&count)
		if count > 0 {
			return User{}, borgo.ErrUserExists
		}
		user := User{Username: username, Hash: hash}
		return user, db.DB.Create(&user).Error
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
