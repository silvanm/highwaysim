import * as _ from "../node_modules/lodash/lodash.js"
import {BrainStoreElem} from "./Main";
import {Car, LanechangeData} from "./Car";
import {Ticker} from "./Ticker";

// Actions the AI can do
const NOTHING = 0;
const ACCELERATE = 1;
const BRAKE = 2;
const CHANGE_LANE = 3;

const REWARD_COLLISION = -1;

export class AICar extends Car {

    // Actions the brain can do
    actions: number[] = [];

    // The next action to take
    action: number = 0;

    brain: any | null;

    brainStoreElem: BrainStoreElem;

    numStates : number = 3;

    // last reward the car has experienced
    reward: number = 0;

    constructor(id: number,
                fullspeed: number = 50,
                lane: number = 1,
                ticker: Ticker) {
        super(id, fullspeed, lane, ticker)

        console.log("Launching AI Car");

        this.actions.push(NOTHING); // nothing
        this.actions.push(ACCELERATE); // accelerate
        this.actions.push(BRAKE); // brake
        this.actions.push(CHANGE_LANE); // change lane
    }

    /**
     * Update internal values according the elapsed time
     */
    update() {
        super.update();
        this.forward();

        this.backward();
    }

    updateState() {
        let oldState = this.state;

        switch (this.lanechange_state) {
            case Car.LANECHANGE_STATE_CONSTANT:
                if (this.laneChangeNeeded()) {
                    this.lanechange_state = Car.LANECHANGE_STATE_CHANGE;
                    this.lanechangeData = {
                        startAt: this.ticker.now(),
                        startLaneId: this.lane,
                        destLaneId: 1 - this.lane,
                        completionQuota: 0,
                        lastSwitchAt: 0
                    }
                    this.updateBlinkers()
                }
                break;

            case Car.LANECHANGE_STATE_CHANGE:

                break;
        }

        switch (this.state) {

            case Car.STATE_RUNCONSTANT:
                this.acceleration = 0;
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if (this.speed == 0) {
                    this.state = Car.STATE_STOPPED
                    this.speed = 0
                    // add AI action here
                } else if (this.brakingNeeded()) {
                    this.state = Car.STATE_LAGBRAKING;
                    this.lagStart = this.ticker.now();
                } else if ((this.speed < this.fullspeed)
                    && this.action == ACCELERATE
                    // next car should not be stopped
                    && (_.isUndefined(this.nextCar) || this.speed > 0)) {
                    this.lagStart = this.ticker.now();
                    this.state = Car.STATE_LAGACCELERATING;
                }

                break;

            case Car.STATE_LAGBRAKING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((this.ticker.now() - this.lagStart) >= this.reactionTime) {
                    this.state = Car.STATE_BRAKING;
                    this.lagStart = null;
                }
                break;

            case Car.STATE_BRAKING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if (this.speed <= 0) {
                    this.state = Car.STATE_STOPPED
                    this.speed = 0
                } else {
                    // This formula is really hard to model. I built it by trial and error...
                    this.acceleration = (-(10 / _.clamp(this.distanceToNextCarCalc() - this.comfortableDistance() / 2, 0.2, 100))
                        + this.minBrakingAcceleration) * (1)
                    // console.log("Carid: " + this.id + ", Acceleration: " + this.acceleration + " this.speedDifferenceToNextCar: " + this.speedDifferenceToNextCar )

                }
                break;

            case Car.STATE_MANUALBRAKING:
                if ((this.ticker.now() - this.lagStart) >= 500) {
                    this.state = Car.STATE_LAGRUNCONSTANT;
                    this.lagStart = null;
                }
                break;

            case Car.STATE_LAGRUNCONSTANT:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((this.ticker.now() - this.lagStart) >= this.reactionTime) {
                    this.state = Car.STATE_RUNCONSTANT;
                    this.acceleration = 0;
                }
                break;

            case Car.STATE_STOPPED:
                // add AI action here
                if (this.action == ACCELERATE) {
                    this.lagStart = this.ticker.now();
                    this.state = Car.STATE_LAGACCELERATING;
                }
                break;

            case Car.STATE_LAGACCELERATING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((this.ticker.now() - this.lagStart) >= this.reactionTime) {
                    this.lagStart = null;
                    this.state = Car.STATE_ACCELERATING;
                }
                break;

            case Car.STATE_ACCELERATING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if (this.speed >= this.fullspeed) {
                    this.state = Car.STATE_RUNCONSTANT;
                    this.speed = this.fullspeed;
                    this.acceleration = 0;
                } else {
                    this.acceleration = this.defaultAcceleration;
                }
                break;

            case Car.STATE_COLLISION:
                this.speed = 0;
                if (this.collisionStart == null) {
                    this.collisionStart = this.ticker.now();
                    this.reward = REWARD_COLLISION;
                    this.brainStoreElem.collisions++;
                    this.collisionCallback();
                } else if ((this.ticker.now() - this.collisionStart) >= 3000
                    && this.distanceToNextCarCalc() > this.comfortableDistance()) {
                    this.collisionStart = null;
                    this.acceleration = 0;
                    this.state = Car.STATE_RUNCONSTANT
                }
        }

        /*if (oldState != this.state) {
            console.log("Id: " + this.id + ": " + this.state)
        }*/
    }

    getNumStates() {
        return this.numStates;
    }

    getMaxNumActions() {
        return this.actions.length;
    }

    laneChangeNeeded() {
        return this.action == CHANGE_LANE;
    }

    brakingNeeded():boolean {
        return this.action == BRAKE;
    }

    forward() {

        let inputArray: number[] = [];

        inputArray[0] = this.speed / this.fullspeed;
        inputArray[1] = this.lane;
        inputArray[2] = this.distanceToNextCar > this.roadLengthPixel ? 1 : this.distanceToNextCar / this.roadLengthPixel ;

        //console.log(`Car=${this.id}, Sp=${inputArray[0].toFixed(2)}, Ln=${inputArray[1].toFixed(0)}, D=${inputArray[2].toFixed(2)}`);

        if (this.brain !== null) {
            this.action = this.brain.act(inputArray);
            //console.log(this.action);
        }
    }

    backward() {
        if (this.reward != 0) {
            console.log("Reward=" + this.reward);
            this.brain.learn(this.reward);
            this.brainStoreElem.rewards += this.reward;
            this.reward = 0;
        }
    }
}
