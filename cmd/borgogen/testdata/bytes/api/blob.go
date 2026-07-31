package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type ByteAlias = byte
type ByteDef byte

// encoding/json base64s all three slices, whatever the element is named:
// {"raw":"AQID","alias":"AQID","defined":"AQID","arr":[1,2,3,4]}
type Blob struct {
	Raw     []byte      `json:"raw"`
	Alias   []ByteAlias `json:"alias"`
	Defined []ByteDef   `json:"defined"`
	Arr     [4]byte     `json:"arr"`
}

//borgo:route GET /api/blob
func GetBlob(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Blob{})
}

// A byte-kinded element that marshals itself takes the slice out of the
// base64 path: json.Marshal(SelfBytes{}) with one element in each slice is
// {"text":["tb"],"ptext":["pb"],"js":["jb"]}, three arrays of strings.
type TextByte byte

func (TextByte) MarshalText() ([]byte, error) { return []byte("tb"), nil }

type PtrTextByte byte

func (*PtrTextByte) MarshalText() ([]byte, error) { return []byte("pb"), nil }

type JSONByte byte

func (JSONByte) MarshalJSON() ([]byte, error) { return []byte(`"jb"`), nil }

type SelfBytes struct {
	Text  []TextByte    `json:"text"`
	PText []PtrTextByte `json:"ptext"`
	JS    []JSONByte    `json:"js"`
}

//borgo:route GET /api/selfbytes
func GetSelfBytes(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, SelfBytes{})
}
