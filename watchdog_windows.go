//go:build windows

package borgo

import "syscall"

// waitParentExit blocks until the process is gone. SYNCHRONIZE is the only
// right the wait needs, and a parent grants it to children implicitly; if the
// handle cannot be opened at all the process is already gone.
func waitParentExit(pid int) {
	h, err := syscall.OpenProcess(syscall.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return
	}
	defer syscall.CloseHandle(h)
	syscall.WaitForSingleObject(h, syscall.INFINITE)
}
