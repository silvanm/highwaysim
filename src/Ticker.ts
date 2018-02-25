
export class Ticker {
    lastTimestamp: number;
    ticks: number = 0;
    timeouts: any[] = [];
    timestep: number = 1;

    constructor() {
        this.timeouts = [];
        this.lastTimestamp = Date.now()
    }

    tick() {
        let curTimestamp = Date.now();
        this.ticks += (curTimestamp - this.lastTimestamp) * this.timestep;
        this.lastTimestamp = curTimestamp;
        let self=this;

        this.timeouts.forEach(function(t, ix) {
            if (t!==null && (t.at < self.ticks)) {
                t.callback();
                self.timeouts.splice(ix,1);
            }
        })

    }

    setTimestep(timestep:number) {
        this.timestep = timestep
    }

    now() {
        return this.ticks;
    }

    setTimeout(callback:Function, ticks:number) {
        console.log("adding callback at ticks" + ticks)
        this.timeouts.push({
            callback: callback,
            at: this.ticks+ticks
        })
    }
}