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

// Tier's MarshalText is on the pointer receiver, so encoding/json calls it
// only where the value it reaches is addressable. json.Marshal(PtrText{}) is
//
//	{"one":0,"many":["tier"],"keyed":{"0":0},"deep":{"one":0}}
//
// - the same Go type on the wire as a number and as a string in one response.
type Tier int

func (t *Tier) MarshalText() ([]byte, error) { return []byte("tier"), nil }

type TierBox struct {
	One Tier `json:"one"`
}

type PtrText struct {
	One   Tier         `json:"one"`
	Many  []Tier       `json:"many"`
	Keyed map[Tier]int `json:"keyed"`
	Deep  TierBox      `json:"deep"`
}

//borgo:route GET /api/ptrtext
func GetPtrText(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, PtrText{})
}
