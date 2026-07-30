package api

import "github.com/LuigiDavideMicca/borgo"

func notify(topic string) {
	borgo.PushT(topic, "created", 1)
}
