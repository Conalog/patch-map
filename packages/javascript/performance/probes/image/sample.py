# macOS proc_pid_rusage v2 physical footprint; 50 ms sampling.
# CPU counters use the host Mach timebase. Includes root + descendants;
# excludes the sampler and its ps helper. Keeps exited process CPU counters.
import ctypes, ctypes.util, json, os, signal, subprocess, sys, time
root = int(sys.argv[1])
running = True
def stop(*_):
    global running
    running = False
signal.signal(signal.SIGTERM, stop)
lib = ctypes.CDLL(ctypes.util.find_library('proc'))
class Timebase(ctypes.Structure):
    _fields_ = [('numer', ctypes.c_uint32), ('denom', ctypes.c_uint32)]
timebase = Timebase()
ctypes.CDLL(ctypes.util.find_library('System')).mach_timebase_info(ctypes.byref(timebase))
cpu_scale = timebase.numer / timebase.denom / 1e9
class Usage(ctypes.Structure):
    _fields_ = [('uuid', ctypes.c_uint8 * 16)] + [(name, ctypes.c_uint64) for name in ['user','system','pkg_wakeups','interrupt_wakeups','pageins','wired','resident','footprint','start','exit','child_user','child_system','child_pkg_wakeups','child_interrupt_wakeups','child_pageins','child_elapsed','disk_read','disk_written']]
known = {}
while running:
    t = time.time()
    lines = subprocess.check_output(['ps','-A','-o','pid=,ppid=,comm='], text=True).splitlines()
    entries = [line.split(maxsplit=2) for line in lines]
    parents = {int(p):int(pp) for p,pp,comm in entries}
    names = {int(p):comm for p,pp,comm in entries}
    pids = {root}
    while True:
        children = {p for p, pp in parents.items() if pp in pids}
        new = pids | children
        if new == pids: break
        pids = new
    excluded = {os.getpid()}
    while True:
        expanded = excluded | {p for p, pp in parents.items() if pp in excluded}
        if expanded == excluded: break
        excluded = expanded
    processes = []
    for pid in pids - excluded:
        u = Usage()
        if lib.proc_pid_rusage(pid, 2, ctypes.byref(u)) == 0:
            cpu = (u.user + u.system) * cpu_scale
            known[pid] = cpu
            processes.append({'pid':pid,'ppid':parents.get(pid),'command':names.get(pid),'cpuSeconds':cpu,'rssMiB':u.resident/1048576,'footprintMiB':u.footprint/1048576})
    print(json.dumps({'epochMs': t*1000,'cpuTimebase':{'numer':timebase.numer,'denom':timebase.denom},'processes':processes,'cpuSecondsObservedCumulative':sum(known.values()),'rssMiB':sum(p['rssMiB'] for p in processes),'footprintMiBSum':sum(p['footprintMiB'] for p in processes)}), flush=True)
    time.sleep(max(0, .05 - (time.time()-t)))
