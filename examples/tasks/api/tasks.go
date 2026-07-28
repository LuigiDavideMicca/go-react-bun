package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
	"gorm.io/gorm"

	"tasks/db"
)

type Task struct {
	gorm.Model
	Title string `json:"title"`
	Body  string `json:"body"`
}

type TaskList struct {
	Tasks []Task `json:"tasks"`
}

type TaskItem struct {
	Task Task `json:"task"`
}

type Deleted struct {
	Deleted bool `json:"deleted"`
}

//borgo:route GET /api/tasks
func ListTasks(w http.ResponseWriter, r *http.Request) {
	var tasks []Task
	if err := db.DB.Order("created_at desc").Find(&tasks).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	borgo.JSON(w, http.StatusOK, TaskList{Tasks: tasks})
}

//borgo:route POST /api/tasks
func CreateTask(w http.ResponseWriter, r *http.Request) {
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
	borgo.JSON(w, http.StatusCreated, TaskItem{Task: task})
}

//borgo:route GET /api/tasks/{id}
func GetTask(w http.ResponseWriter, r *http.Request) {
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
	borgo.JSON(w, http.StatusOK, TaskItem{Task: task})
}

//borgo:route DELETE /api/tasks/{id}
func DeleteTask(w http.ResponseWriter, r *http.Request) {
	if err := db.DB.Delete(&Task{}, "id = ?", r.PathValue("id")).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	borgo.JSON(w, http.StatusOK, Deleted{Deleted: true})
}
