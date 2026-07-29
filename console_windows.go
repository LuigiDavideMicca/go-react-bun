//go:build windows

package borgo

import (
	"os"
	"syscall"
)

var procGetConsoleOutputCP = syscall.NewLazyDLL("kernel32.dll").NewProc("GetConsoleOutputCP")

// utf-8 marks survive only a real console in codepage 65001: legacy consoles
// render mojibake, and piped output gets decoded with powershell's legacy
// default
func consoleUnicode() bool {
	fi, err := os.Stdout.Stat()
	if err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	cp, _, _ := procGetConsoleOutputCP.Call()
	return cp == 65001
}
