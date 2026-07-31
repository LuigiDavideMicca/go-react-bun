//go:build !windows

package borgo

import (
	"os"
	"syscall"
	"time"
)

// waitParentExit polls until the process named by pid is gone; there is no
// portable blocking wait on a non-child process. When pid is this process's
// direct parent - the usual borgo dev/start shape - the poll watches getppid
// instead of probing the pid: reparenting to init (or a subreaper) is
// observable even after the freed pid is reused, where a kill-0 probe would
// read the recycled pid as the parent still running and orphan the api. For
// any other pid the kill-0 probe is all there is; EPERM means the process
// exists but belongs to a user this one may not signal - a supervisor that
// dropped privileges for the api - so it counts as alive: treating it as an
// error would shut the api down seconds after boot.
func waitParentExit(pid int) {
	direct := os.Getppid() == pid
	for {
		if direct {
			if os.Getppid() != pid {
				return
			}
		} else if err := syscall.Kill(pid, 0); err != nil && err != syscall.EPERM {
			return
		}
		time.Sleep(2 * time.Second)
	}
}
