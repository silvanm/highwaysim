/**
 * Created by silvan.muehlemann on 12.10.16.
 *
 * The car uses metric units to measure the behavior
 */


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

    public stateColors = {
        'runconstant': 'black',
        'lagrunconstant': 'gray',
        'lagbraking': 'orange',
        'braking': 'red',
        'manualbraking' : 'lightred',
        'stopped': 'red',
        'lagaccelerating': 'cyan',
        'accelerating': 'blue',
        'collision': 'green',
    };

    // Dimensions in meter
    public static dimensions = {'width': 2, 'length': 3};

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
    minDistanceToNextCar:number;

    fullspeed:number;

    // timestamp of the last update
    lastUpdate:number;

    // timestamp when the lag start
    lagStart:number;

    // timestamp when the collision startet
    collisionStart: number;

    // the acceleration when not braking
    defaultAcceleration:number;

    // for every second, how many km/h the speed can vary
    speedVariance = 3;

    // callback if we have a collision
    collisionCallback = function() {};

    // link to the next car
    nextCar:Car = null;

    svgObj:any;

    constructor(id:number,
                fullspeed:number = 50,
                lane:number = 1) {
        this.lastUpdate = Date.now();
        this.id = id;
        this.lane = lane;
        this.speed = 0;
        this.position = 0;
        this.acceleration = 0;
        this.distanceToNextCar = 9999;
        this.brakingDistanceLimit = 100;
        this.reactionTime = 500;
        this.minDistanceToNextCar = 5;
        this.minBrakingAcceleration = -10;
        this.fullspeed = fullspeed;
        this.defaultAcceleration = 10;
        this.speedVariance = 5;

    }

    run(speed:number) {
        this.state = Car.STATE_RUNCONSTANT;
        this.speed = speed
    }

    /**
     * Update internal values according the elapsed time
     */
    update() {
        this.updateState();
        this.updateSpeed();

        let millisSinceLastUpdate = (Date.now() - this.lastUpdate)
        // update the position
        this.position += (this.speed * 1000 / (3600 * 1000) * millisSinceLastUpdate)
        this.lastUpdate = Date.now();
    }

    manualBraking() {
        this.speed -= 10;
        this.state = Car.STATE_MANUALBRAKING;
        this.lagStart = Date.now();
    }

    updateState() {
        let oldState = this.state;

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
                    this.lagStart = Date.now();
                } else if ((this.speed < this.fullspeed) && !this.tooCloseToNextCar()) {
                    // @todo don't start if the next car is still stopped
                    this.lagStart = Date.now();
                    this.state = Car.STATE_LAGACCELERATING;
                }

                break;

            case Car.STATE_LAGBRAKING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((Date.now() - this.lagStart) >= this.reactionTime) {
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
                    this.lagStart = Date.now();
                    this.state = Car.STATE_LAGRUNCONSTANT;
                } else {

                    this.acceleration = this.minBrakingAcceleration -
                        10 * 1 / (
                            Math.min(100,
                                Math.max(this.distanceToNextCar - this.minDistanceToNextCar, 0.1)))

                }
                break;

            case Car.STATE_MANUALBRAKING:
                if ((Date.now() - this.lagStart) >= 500) {
                    this.state = Car.STATE_LAGRUNCONSTANT;
                    this.lagStart = null;
                }
                break;

            case Car.STATE_LAGRUNCONSTANT:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((Date.now() - this.lagStart) >= this.reactionTime) {
                    this.state = Car.STATE_RUNCONSTANT;
                    this.acceleration = 0;
                }
                break;

            case Car.STATE_STOPPED:
                if (this.distanceToNextCar > this.minBrakingAcceleration) {
                    this.lagStart = Date.now();
                    this.state = Car.STATE_LAGACCELERATING;
                }
                break;

            case Car.STATE_LAGACCELERATING:
                if (this.isCollision()) {
                    this.state = Car.STATE_COLLISION
                } else if ((Date.now() - this.lagStart) >= this.reactionTime) {
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
                    this.collisionStart = Date.now();
                    this.collisionCallback();
                } else if ((Date.now() - this.collisionStart) >= 3000
                && this.distanceToNextCar > this.comfortableDistance()) {
                    this.collisionStart = null;
                    this.acceleration = 0;
                    this.state = Car.STATE_RUNCONSTANT
                }
        }

        /*if (oldState != this.state) {
            console.log("Id: " + this.id + ": " + this.state)
        }*/
    }

    isCollision(): boolean {
        return this.distanceToNextCar < Car.dimensions.length;
    }

    brakingNeeded():boolean {
        let result =
            (!this.tooFarFromNextCar()
            && (this.speedDifferenceToNextCar > 5))
        || this.tooCloseToNextCar()
        return result;
    }

    tooFarFromNextCar(): boolean {
        let result = (Math.abs(this.distanceToNextCar) >= this.comfortableDistance() * 1.5)
        return result;
    }

    tooCloseToNextCar() : boolean {
        let result = (this.distanceToNextCar <= this.comfortableDistance() * 1)
        return result;
    }

    comfortableDistance() {
        return Math.max(this.speed / 3600 * 1000, 5);
    }

    updateSpeed() {
        this.speed += (Date.now() - this.lastUpdate) / 1000 * this.acceleration;

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
