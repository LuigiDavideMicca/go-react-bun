package api

import "github.com/LuigiDavideMicca/borgo"

func notify() {
	borgo.PushT("live/chat", "created", 1)
}
