//go:build !windows

package borgo

import (
	"syscall"
	"time"
)

// waitParentExit polls the pid with signal 0 until it is gone; there is no
// portable blocking wait on a non-child process. EPERM means the process
// exists but belongs to a user this one may not signal - a supervisor that
// dropped privileges for the api - so it counts as alive: treating it as an
// error would shut the api down seconds after boot.
func waitParentExit(pid int) {
	for {
		if err := syscall.Kill(pid, 0); err != nil && err != syscall.EPERM {
			return
		}
		time.Sleep(2 * time.Second)
	}
}
