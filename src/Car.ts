import * as _ from "../node_modules/lodash/lodash.js"
import { AdjacentCars, AdjacentCarsPerLane } from "./Main";
import {Ticker} from "./Ticker";
import {AICar} from "./AICar";

export interface LanechangeData {
    startAt : number
    startLaneId : number
    destLaneId : number
    completionQuota : number
    lastSwitchAt : number
}

export class Car {

    public static STATE_RUNCONSTANT = 'runconstant';
    public static STATE_LAGRUNCONSTANT = 'lagrunconstant';
    public static STATE_LAGBRAKING = 'lagbraking';
    public static STATE_BRAKING = 'braking';
    public static STATE_MANUALBRAKING = 'manualbraking';
    public static STATE_STOPPED = 'stopped';
    public static STATE_LAGACCELERATING = 'lagaccelerating';
    public static STATE_ACCELERATING = 'accelerating';
    public static STATE_COLLISION = 'collision';

    public static LANECHANGE_STATE_CONSTANT = 'constant';
    public static LANECHANGE_STATE_CHANGE = 'lanechange';

    public stateColors = {
        'runconstant': 'white',
        'lagrunconstant': 'gray',
        'lagbraking': 'orangered',
        'braking': 'red',
        'manualbraking' : 'red',
        'stopped': 'red',
        'lagaccelerating': 'green',
        'accelerating': 'lightgreen',
        'collision': 'brown'
    };

    // Dimensions in meter
    public static dimensions = {'width': 2, 'length': 3};

    public static laneChangeDurationMillis = 2000;

    // Internal Autoincrement ID of the car.
    id:number;

    // Position in meters
    position:number;

    // Lane the car is running in.
    lane:number;

    // speed in km/h
    speed:number;

    // acceleration in km/h/s
    acceleration:number;

    // the current state in the state machine
    state:string;

    lanechange_state:string = 'constant';

    // if it s removed from the screen
    removed:boolean = false;

    // distance in meters to the next car
    distanceToNextCar:number;

    // if >0 then we're faster
    speedDifferenceToNextCar:number;

    // meters where we start braking
    brakingDistanceLimit:number;

    // When we brake, what is the initial acceleration we have
    minBrakingAcceleration:number;

    // millis in reaction time
    reactionTime:number;

    // meters where we start again (from a stopped state)
    mindistanceToNextCar:number;

    fullspeed:number;

    // timestamp of the last update
    lastUpdate:number;

    // timestamp when the lag start
    lagStart:number;

    // timestamp when the collision startet
    collisionStart: number;

    // timestamp when the lanechange started
    lanechangeData : LanechangeData = {
        startAt : null,
        startLaneId : null,
        destLaneId : null,
        completionQuota : 0,
        lastSwitchAt : null
    };

    // the acceleration when not braking
    defaultAcceleration:number;

    // for every second, how many km/h the speed can vary
    speedVariance = 3;

    // callback if we have a collision
    collisionCallback = function() {};

    // link to the next car
    nextCar:Car = null;

    // fuel consumption
    fuelConsumption:number = 0;

    svgObj:any;

    // the picture of the car
    svgImage:any;

    svgRect: any;

    svgLabel: any;

    // the turn indicators
    blinkLeft : any;
    blinkRight : any;

    adjacentCars : AdjacentCars;

    // constansts necessary for the Reinforcment learning

    roadLengthPixel: number;

    meterToPixels: number;

    ticker: Ticker;


    constructor(id:number,
                fullspeed:number = 50,
                lane:number = 1,
                ticker:Ticker) {
        this.ticker = ticker;
        this.lastUpdate = this.ticker.now();
        this.id = id;
        this.lane = lane;
        this.speed = 0;
        this.position = 0;
        this.acceleration = 0;
        this.distanceToNextCar = 9999;
        this.brakingDistanceLimit = 100;
        this.reactionTime = 500;
        this.mindistanceToNextCar = 5;
        this.minBrakingAcceleration = -10;
        this.fullspeed = fullspeed;
        this.defaultAcceleration = 10;
        this.speedVariance = 5;

        this.adjacentCars = {
            sameLane : { previousCar : null, nextCar: null},
            fasterLane : { previousCar : null, nextCar: null},
            slowerLane : { previousCar : null, nextCar: null}
        }
    }


    run(speed:number) {
        this.state = Car.STATE_RUNCONSTANT;
        this.speed = speed;
    }

    /**
     * Update internal values according the elapsed time
     */
    update() {
        this.updateState();
        this.updateSpeed();

        let millisSinceLastUpdate = (this.ticker.now() - this.lastUpdate)
        // update the position
        this.position += (this.speed * 1000 / (3600 * 1000) * millisSinceLastUpdate)

        if (this.lanechange_state == Car.LANECHANGE_STATE_CHANGE) {
            let newCompletionQuota = this.lanechangeData.completionQuota + millisSinceLastUpdate / Car.laneChangeDurationMillis;

            if (newCompletionQuota >= 1) {
                this.lanechange_state = Car.LANECHANGE_STATE_CONSTANT;
                this.lane = this.lanechangeData.destLaneId
                this.lanechangeData.completionQuota = 0;
                this.lanechangeData.startAt = null;
                this.lanechangeData.lastSwitchAt = this.ticker.now();
                this.updateBlinkers()
            } else {
                this.lanechangeData.completionQuota = newCompletionQuota;

            }

        }

        // assumption: fuel usage ^2 to the speed and ^3 to the acceleration
        this.fuelConsumption += millisSinceLastUpdate * ((Math.pow(this.speed, 2) + Math.pow(Math.max(this.acceleration * 2, 0), 3))) / 1000

        this.lastUpdate = this.ticker.now();
    }


    createSvg(svg, meterToPixel) {
        let self = this;
        let img = svg.image("img/car_normal.png?a=2",
            0,
            0,
            Car.dimensions.length * meterToPixel,
            Car.dimensions.length * meterToPixel
        )

        let rect = svg.rect(0, 0,
            Car.dimensions.length * meterToPixel,
            Car.dimensions.length * meterToPixel
        )

        let idLabel = svg.text(3 * meterToPixel, 10, this.id + ("brain" in this ? " AI" : "")).attr('class', 'labelId').attr('fill', 'white').attr('font-size', '12');
        this.svgLabel = svg.text(3 * meterToPixel, 20, "-").attr('fill', 'white').attr('font-size', '12');
        this.svgLabel.attr('class', 'labelId')

        this.blinkLeft = svg.image("img/blink_left.gif",
        0,
        0,
            Car.dimensions.length * meterToPixel,
            Car.dimensions.length * meterToPixel

        )

        this.blinkRight = svg.image("img/blink_right.gif",
            0,
            0,
            Car.dimensions.length * meterToPixel,
            Car.dimensions.length * meterToPixel

        )

        let g = svg.group(img, this.blinkLeft, this.blinkRight, rect, idLabel, this.svgLabel);
        rect.attr('opacity', '0.5');
        rect.attr('class', 'stateIndicator')

        this.svgImage = img;
        this.svgRect = rect;
        this.svgObj = g
            .hover(function () {
                console.log(self)
                self.manualBraking();
            })
            .click(function () {
                self.manualBraking();
            })

        this.updateBlinkers()
        this.updateLabel()
    }
    
    updateSvg(x, y) {
        this.svgObj.transform("translate(" + x + " " + y + ")");

        if (this.stateColors[this.state] == 'red') {
            this.svgImage.attr('href', 'img/car_braking.png?a=3')
        } else if (this.stateColors[this.state] == 'lightred') {
            this.svgImage.attr('href', 'img/car_action.png?a=3')
        } else {
            this.svgImage.attr('href', 'img/car_normal.png?a=2')
        }

        this.svgRect.attr('fill', this.stateColors[this.state]);
    }

    updateLabel() {
        this.svgLabel.attr('text', Math.round(this.speed) + "km/h")
    }

    updateBlinkers() {
        if (this.lanechange_state == Car.LANECHANGE_STATE_CONSTANT) {
            this.blinkLeft.attr('display', 'none');
            this.blinkRight.attr('display', 'none');
        } else if (this.lanechangeData.destLaneId > this.lanechangeData.startLaneId) {
            this.blinkLeft.attr('display', 'none');
            this.blinkRight.attr('display', 'inherit');
        } else  {
            this.blinkLeft.attr('display', 'inherit');
            this.blinkRight.attr('display', 'none');
        }
    }

    distanceToNextCarCalc():number {
        if (_.isNull(this.adjacentCars.sameLane.nextCar))
            return 9999;

        if (this.adjacentCars.sameLane.nextCar.removed)
            return 9999;

        return this.adjacentCars.sameLane.nextCar.position -
                this.position;
    }

    manualBraking() {
        this.speed -= 10;
        this.state = Car.STATE_MANUALBRAKING;
        this.lagStart = this.ticker.now();
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
                } else if (this.brakingNeeded()) {
                    this.state = Car.STATE_LAGBRAKING;
                    this.lagStart = this.ticker.now();
                } else if ((this.speed < this.fullspeed)
                    && !this.tooCloseToNextCar()
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
                } else if (this.speed == 0) {
                    this.state = Car.STATE_STOPPED
                    this.speed = 0
                } else if (this.speedDifferenceToNextCar < 0) {
                    // The other car is faster
                    this.lagStart = this.ticker.now();
                    this.state = Car.STATE_LAGRUNCONSTANT;
                } else {

                    // This formula is really hard to model. I built it by trial and error...
                    this.acceleration = (- (10 / _.clamp(this.distanceToNextCarCalc() - this.comfortableDistance() / 2, 0.2, 100))
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
                if (this.distanceToNextCarCalc() > this.minBrakingAcceleration) {
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
                } else if (!this.tooFarFromNextCar()) {
                    this.state = Car.STATE_RUNCONSTANT;
                    this.acceleration = 0;
                } else {
                    this.acceleration = this.defaultAcceleration;
                }
                break;

            case Car.STATE_COLLISION:
                this.speed = 0;
                if (this.collisionStart == null) {
                    this.collisionStart = this.ticker.now();
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

    laneChangeNeeded(): boolean {

        if (_.indexOf([Car.STATE_COLLISION, Car.STATE_STOPPED], this.state) >= 0)
            return false;

        // no lane switch if we're slower than the car in front
        if (
            !_.isNumber(this.speedDifferenceToNextCar) ||
            this.speedDifferenceToNextCar/this.speed < 0.1)
            return false;

        if (this.speed < 30)
            return false;

        // no lane switch if we just have completed the last lane switch
        if (this.ticker.now() - this.lanechangeData.lastSwitchAt < 10000 )
            return false;

        // no lane switching if no car in front (or car too far away)
        if (this.adjacentCars.sameLane.nextCar == null
        || (this.adjacentCars.sameLane.nextCar.position - this.position > this.comfortableDistance() * 2)
        )
            return false

        // the car in front is switching lane then don't switch lanes
        if (this.adjacentCars.sameLane.nextCar != null
        && this.adjacentCars.sameLane.nextCar.lanechange_state == Car.LANECHANGE_STATE_CHANGE)
            return false;

        let otherLane = this.lane == 1 ? 'fasterLane' : 'slowerLane';

        // enough space on other lane in front
        if  ((this.adjacentCars[otherLane].nextCar == null || this.adjacentCars[otherLane].nextCar.removed ||
            (this.adjacentCars[otherLane].nextCar.position - this.position) > this.comfortableDistance())
            // enough space on other lane in back
            && (this.adjacentCars[otherLane].previousCar == null ||
        (this.position - this.adjacentCars[otherLane].previousCar.position) > this.comfortableDistance() / 2))
      {
          // don't switch if the car in the other lane is faster
          if  (this.adjacentCars[otherLane].nextCar != null && !this.adjacentCars[otherLane].nextCar.removed
              && (this.adjacentCars[otherLane].nextCar.speed < this.speed ))
                return false;

              return true;
        }

        return false;
    }

    isCollision(): boolean {
        return this.distanceToNextCarCalc() < Car.dimensions.length;
    }

    brakingNeeded():boolean {
        let result =
            (!this.tooFarFromNextCar()
            && (this.speedDifferenceToNextCar/this.speed > 0.1 ))
        || this.tooCloseToNextCar()
        return result;
    }

    tooFarFromNextCar(): boolean {
        let result = (Math.abs(this.distanceToNextCarCalc()) >= this.comfortableDistance() * 2)
        return result;
    }

    tooCloseToNextCar() : boolean {
        let result = (this.distanceToNextCarCalc() <= this.comfortableDistance() * 1)
        return result;
    }

    comfortableDistance() {
        return Math.max(this.speed / 3600 * 1000, 3);
    }

    getLaneConsideringLanechange() {
        // if we have already passed half of the lane we appear to be in the other lane.
        if (this.lanechangeData.completionQuota >= 0.5) {
            return 1 - this.lane
        } else {
            return this.lane
        }
    }

    updateSpeed() {
        this.speed += (this.ticker.now() - this.lastUpdate) / 1000 * this.acceleration;

        // The speed always occiliates
        //this.speed += Math.sin(this.lastUpdate / 1000 / 3.1412 / 2 ) * this.speedVariance

        if (this.speed <= 0) {
            this.speed = 0;
        }

        if (this.speed >= this.fullspeed) {
            this.speed = this.fullspeed;
        }
    }
}
