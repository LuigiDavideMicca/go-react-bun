package api

import (
	"net/http"
	"net/netip"

	"github.com/LuigiDavideMicca/borgo"
)

// UUID and Level reach the wire through MarshalText, so both are strings
// there whatever their Go shape is:
// {"id":"0-0-0-0","lvl":"info","addr":"","keyed":{"0-0-0-0":1}}
type UUID [16]byte

func (UUID) MarshalText() ([]byte, error) { return []byte("0-0-0-0"), nil }

type Level int

func (Level) MarshalText() ([]byte, error) { return []byte("info"), nil }

// NotAMarshaler has the name but not the signature.
type NotAMarshaler int

func (NotAMarshaler) MarshalText(int) []byte { return nil }

type Resp struct {
	ID    UUID          `json:"id"`
	Lvl   Level         `json:"lvl"`
	Addr  netip.Addr    `json:"addr"`
	Keyed map[UUID]int  `json:"keyed"`
	Plain NotAMarshaler `json:"plain"`
}

//borgo:route GET /api/resp
func GetResp(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Resp{})
}
