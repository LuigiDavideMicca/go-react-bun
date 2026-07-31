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
