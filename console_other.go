//go:build !windows

package borgo

func consoleUnicode() bool {
	return true
}
