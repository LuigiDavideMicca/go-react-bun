package api

import (
	"net/http"
	"time"

	"github.com/LuigiDavideMicca/borgo"
)

type Inner struct {
	A int `json:"a"`
}

// json.Marshal(Optional{}) writes exactly
//
//	{"a2":[0,0],"st":{"a":0},"t":"0001-01-01T00:00:00Z","m":{"a":0},"typo":0}
//
// so every other field here is optional and these five are not.
type Optional struct {
	Bool  bool           `json:"bool,omitempty"`
	Num   int            `json:"num,omitempty"`
	Str   string         `json:"str,omitempty"`
	Slice []int          `json:"slice,omitempty"`
	Map   map[string]int `json:"map,omitempty"`
	Ptr   *int           `json:"ptr,omitempty"`
	Iface any            `json:"iface,omitempty"`
	A0    [0]int         `json:"a0,omitempty"`

	A2 [2]int    `json:"a2,omitempty"`
	St Inner     `json:"st,omitempty"`
	T  time.Time `json:"t,omitempty"`
	M  Inner     `json:"m,omitempty"`

	ZeroSt   Inner     `json:"zerost,omitzero"`
	ZeroNum  int       `json:"zeronum,omitzero"`
	ZeroTime time.Time `json:"zerotime,omitzero"`

	Typo int `json:"typo,omitemptyish"`
}

//borgo:route GET /api/optional
func GetOptional(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Optional{})
}
