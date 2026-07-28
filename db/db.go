package db

import (
	"log"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect() {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = "tasks.db"
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		log.Fatal("can't open database: ", err)
	}
}

func Migrate(models ...any) {
	if err := DB.AutoMigrate(models...); err != nil {
		log.Fatal("migration failed: ", err)
	}
}
