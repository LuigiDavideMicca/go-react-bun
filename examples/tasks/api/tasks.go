package api

import (
	"errors"
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
	"gorm.io/gorm"

	"tasks/db"
)

//borgo:type gorm.io/gorm.DeletedAt string | null

type Task struct {
	gorm.Model
	Title string `json:"title"`
	Body  string `json:"body"`
}

type TaskCreate struct {
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

// a helper: borgogen follows it, so callers still get the TaskItem type
func respondTask(w http.ResponseWriter, status int, task Task) {
	borgo.JSON(w, status, TaskItem{Task: task})
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
	body, err := borgo.Bind[TaskCreate](r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	task := Task{Title: body.Title, Body: body.Body}
	if err := db.DB.Create(&task).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	events.Publish("task-created", task)
	go borgo.PushT("live", "task-created", task.Title)
	respondTask(w, http.StatusCreated, task)
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
	respondTask(w, http.StatusOK, task)
}

//borgo:route DELETE /api/tasks/{id}
func DeleteTask(w http.ResponseWriter, r *http.Request) {
	if err := db.DB.Delete(&Task{}, "id = ?", r.PathValue("id")).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	events.Publish("task-deleted", r.PathValue("id"))
	borgo.WriteJSON(w, http.StatusOK, Deleted{Deleted: true})
}
