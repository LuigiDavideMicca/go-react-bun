//go:build windows

package borgo

import "syscall"

var procGetConsoleOutputCP = syscall.NewLazyDLL("kernel32.dll").NewProc("GetConsoleOutputCP")

// legacy windows consoles (codepage != 65001) render utf-8 as mojibake
func consoleUnicode() bool {
	cp, _, _ := procGetConsoleOutputCP.Call()
	return cp == 65001
}
