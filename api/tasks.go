package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"go-react-bun/db"

	"gorm.io/gorm"
)

type Task struct {
	gorm.Model
	Title string `json:"title"`
	Body  string `json:"body"`
}

func init() {
	model(&Task{})
	handle("GET /api/tasks", listTasks)
	handle("POST /api/tasks", createTask)
	handle("GET /api/tasks/{id}", getTask)
	handle("DELETE /api/tasks/{id}", deleteTask)
}

func listTasks(w http.ResponseWriter, r *http.Request) {
	var tasks []Task
	if err := db.DB.Order("created_at desc").Find(&tasks).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}

func createTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string
		Body  string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	task := Task{Title: body.Title, Body: body.Body}
	if err := db.DB.Create(&task).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"task": task})
}

func getTask(w http.ResponseWriter, r *http.Request) {
	var task Task
	err := db.DB.First(&task, "id = ?", r.PathValue("id")).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, "task not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"task": task})
}

func deleteTask(w http.ResponseWriter, r *http.Request) {
	if err := db.DB.Delete(&Task{}, "id = ?", r.PathValue("id")).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
