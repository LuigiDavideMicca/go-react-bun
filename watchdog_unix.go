//go:build !windows

package borgo

import (
	"syscall"
	"time"
)

// waitParentExit polls the pid with signal 0 until it is gone; there is no
// portable blocking wait on a non-child process.
func waitParentExit(pid int) {
	for {
		if err := syscall.Kill(pid, 0); err != nil {
			return
		}
		time.Sleep(2 * time.Second)
	}
}
