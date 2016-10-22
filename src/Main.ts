import { Car } from "./Car";
import { Slider, Slideroptions } from "./Slider";
import * as _ from "lodash";

declare var Snap:any;

class Statentry {
    activeCarCount:number = 0;
    averageSpeed:number = 0;
    throughput:number = 0;
    fuelConsumption:number = 0;
}

export interface AdjacentCars {
    sameLane : AdjacentCarsPerLane
    fasterLane : AdjacentCarsPerLane
    slowerLane : AdjacentCarsPerLane
}

export interface AdjacentCarsPerLane {
    previousCar : Car
    nextCar : Car
}

class Main {

    svg:any;

    debugMode:boolean = false;

    cars:Car[] = [];

    sliders:Slider[] = [];

    lastCarId:number = 0;

    roadLengthPixel:number;

    lanes:number = 2;

    // change this to easily change the size of the car. Good values are 4 and 8
    meterToPixel = 8;

    // Stores the average speed history. Used to display the sparklines
    stats:Statentry[] = [];

    // Stores the timestamps when cars have passed the track.
    // Used to calculate the throughput
    passedCars:number[] = [];

    crashCounter:number = 0;
    fuelConsumptionCounter:number = 0;
    fuelConsumptionByDeadCars:number = 0;


    public static widthOfLane:number = 3;


    init() {

        this.svg = Snap("#svg");
        this.roadLengthPixel = $('#svg').width()

        let self = this;
        window.setInterval(function () {
            self.updateStats()
        }, 2000);

        let sliderConfig = [
            {
                'name' : 'speed',
                'label' : 'Target speed',
                'tooltip' : 'This is the speed that the car tries to reach',
                'step' : 1,
                'max' : 150,
                'unitlabel': 'km/h',
                'value' : 50
            },
            {
                'name' : 'speed-variance',
                'label' : 'Speed variance',
                'tooltip' : 'Not every car has exactly the same speed. Control this variance here',
                'step' : 5,
                'max' : 100,
                'unitlabel': '% of target speed',
                'value' : 10
            },
            {
                'name' : 'cars-per-minute',
                'label' : 'Launch frequency',
                'tooltip' : 'How many cars should be sent on the road every minute. Note: If there\'s no room on the road the launching of cars will be paused',
                'step' : 5,
                'max' : 120,
                'unitlabel': 'cars/minute',
                'value' : 30
            },
            {
                'name' : 'reaction-time',
                'label' : 'Reaction time',
                'tooltip' : 'How quickly the driver reacts to changing situations on the road.',
                'step' : 100,
                'max' : 5000,
                'unitlabel': 'milliseconds',
                'value' : 200
            },
            {
                'name' : 'acceleration',
                'label' : 'Acceleration power',
                'tooltip' : 'How quickly a car can accelerate',
                'step' : 5,
                'max' : 50,
                'unitlabel': 'km/h/s',
                'value' : 10
            },
        ]

        this.sliders = _.map(sliderConfig, function(conf) {
            let slider = new Slider(conf);
            slider.addToDom('#sliders')
            return slider;
        })

        this.launchCar()
    }


    launchCar() {
        var self = this;

        
        let carsPerMinute = $('#cars-per-minute').slider().data('slider').getValue()
        if (carsPerMinute > 0) {

            // Check if it's safe to launch a car.
            // There needs to be some room on the left side to be able to launch a car
            if (this.cars.length == 0
                || this.cars[this.cars.length - 1].position > Main.getSpeedFromSlider() / 3 / 3600 * 1000) {
                self.addCar();
            }

            window.setTimeout(function () {
                self.launchCar()
            }, 60 / carsPerMinute * 1000)
        } else {
            window.setTimeout(function () {
                self.launchCar()
            }, 1000)
        }
    }


    update() {
        let self = this;

        _.each(this.cars, function (car:Car) {
            car.update();
            let x = car.position * self.meterToPixel - Car.dimensions.length * self.meterToPixel;
            let y = car.lane * Main.widthOfLane * self.meterToPixel

            // t: current time, b: begInnIng value, c: change In value, d: duration
            let easeInOutSine = function (x) {
                return (Math.sin((x*Math.PI- Math.PI/2)) + 1) / 2
            }

            if (car.lanechange_state == Car.LANECHANGE_STATE_CHANGE) {
                y += (- car.lanechangeData.startLaneId + car.lanechangeData.destLaneId) // direction of lane change
                    * easeInOutSine(car.lanechangeData.completionQuota) * Main.widthOfLane * self.meterToPixel ;
            }

            car.updateSvg(x, y)

            // Removing cars which have passed the full track
            if (car.position * self.meterToPixel - Car.dimensions.length * self.meterToPixel >= self.roadLengthPixel) {
                self.fuelConsumptionByDeadCars += car.fuelConsumption
                car.svgObj.remove();
                car.removed = true;
                car.svgObj = null;
                self.passedCars.push(Date.now());
            }
        })

        this.updateDistances();

        _.remove(this.cars, function (n) {
            return n.svgObj == null;
        })

        window.requestAnimationFrame(function () {
            self.update()
        });
    }

    updateDistances() {

        // sort all cars by the position
        // go through each car
        // for each car we want to have the information which car is next and which is past
        // and we want to have this for the same lane, the previous lane and the next lane.
        /*

        - sort the cars by distance
        For each car:
            - go through slower, same and faster lane
              - set the link of the last seen car on the respective lane
              - set the next car (for that last seen car on the respective lane)

        Car   Lane     Last seen car per lane    Assignment
        1     2        1:     2: 1     3:        Car 1: no assignment possible
        2     3        1:     2: 1     3: 2      Car 2:
        3     2        1:     2: 3     3: 2
        4     1        1: 4   2: 3     3: 2
        5     3        1: 4   2: 3     3: 5

         */

        let sortedCars = _.sortBy(this.cars, function(car: Car) {
            return car.position;
        })

        let lastSeenCar:Car[] = [];

        // initialize the last seen car
        for (let i = 0; i < this.lanes; i++) {
            lastSeenCar[i] = null;
        }

        let self = this;

        _.each(sortedCars, function(car:Car) {
            let carLane = car.getLaneConsideringLanechange()
            let slowerLane = carLane + 1 < self.lanes ? carLane + 1 : null;
            let fasterLane = carLane - 1 >= 0 ? carLane - 1 : null;
            let sameLane = carLane;

            if (slowerLane !== null) {
                if (lastSeenCar[slowerLane] !== null) {
                    car.adjacentCars.slowerLane.previousCar = lastSeenCar[slowerLane]
                    lastSeenCar[slowerLane].adjacentCars.fasterLane.nextCar = car
                }
                if (car.adjacentCars.slowerLane.nextCar !== null &&
                    car.adjacentCars.slowerLane.nextCar.removed) {
                    car.adjacentCars.slowerLane.nextCar = null;
                }
            }
            if (fasterLane !== null) {
                if (lastSeenCar[fasterLane] !== null) {
                    car.adjacentCars.fasterLane.previousCar = lastSeenCar[fasterLane]
                    lastSeenCar[fasterLane].adjacentCars.slowerLane.nextCar = car
                }
                if (car.adjacentCars.fasterLane.nextCar !== null &&
                    car.adjacentCars.fasterLane.nextCar.removed) {
                    car.adjacentCars.fasterLane.nextCar = null;
                }
            }
            if (lastSeenCar[sameLane] !== null) {
                car.adjacentCars.sameLane.previousCar = lastSeenCar[sameLane]
                lastSeenCar[sameLane].adjacentCars.sameLane.nextCar = car
                if (car.adjacentCars.sameLane.nextCar !== null &&
                    car.adjacentCars.sameLane.nextCar.removed) {
                    car.adjacentCars.sameLane.nextCar = null;
                }
            }
            lastSeenCar[carLane] = car;
        })

        // go through each lane and calculate the distance and speed differences of the cars.
        for (let i = 0; i < this.lanes; i++) {

            let carsOnThisLane = _.filter(this.cars, function(car:Car) { return car.lane == i; })
            let sortedCars = _.sortBy(carsOnThisLane, function (car:Car) {
                return -car.position;
            })

            let lastPosition;
            let frontCar;
            _.each(sortedCars, function (car:Car, index:number) {
                if (index > 0) {
                    car.distanceToNextCar = frontCar.position - car.position;
                    car.speedDifferenceToNextCar = car.speed - frontCar.speed;
                    car.nextCar = frontCar;
                } else {
                    // The first car in the lane
                    car.distanceToNextCar = 9999;
                    car.speedDifferenceToNextCar = 0;
                    car.nextCar = null;
                }
                frontCar = car;
            })
         }


        let carDistances = _.map(this.cars, function (e) {
            return e.speedDifferenceToNextCar
        });
    }

    addCar() {
        let self = this;
        let car = new Car(this.lastCarId);
        
        car.reactionTime = $('#reaction-time').slider().data('slider').getValue();
        
        car.defaultAcceleration = $('#acceleration').slider().data('slider').getValue();
        let speed = Main.getSpeedFromSlider();
        this.lastCarId++;
        
        car.fullspeed = speed
            + (1 - 2 * Math.random()) * $('#speed-variance').slider().data('slider').getValue() * speed / 100;

        // the lane is selected based on the average speed of all cars and a random component
//        car.lane = car.fullspeed > speed * (0.5 - Math.random()) * 5  ? 0 : 1;
        car.lane = Math.random() > 0.5 ? 0 : 1;

        car.run(car.fullspeed);
        car.collisionCallback = function () {
            self.crashCounter++;
            let explosionSvg = self.svg.image(
                "img/explosion.gif?a=2",
                car.position * self.meterToPixel - self.meterToPixel,
                (car.lane) * self.meterToPixel * Main.widthOfLane - 15,
                50,
                50);
            window.setTimeout(function () {
                explosionSvg.remove();
            }, 1000);

        };
        car.createSvg(this.svg, this.meterToPixel);
        this.cars.push(car);
    }

    static getSpeedFromSlider():number {
        
        return $('#speed').slider().data('slider').getValue();
    }

    getAverageSpeed():number {
        let sum = 0;
        _.each(this.cars, function (car:Car) {
            sum += car.speed
        });
        if (this.cars.length > 0) {
            return sum / this.cars.length;
        } else {
            return Main.getSpeedFromSlider();
        }

    }

    updateStats() {
        let self = this;

        let statEntry = new Statentry();
        statEntry.activeCarCount = self.cars.length;
        statEntry.averageSpeed = Math.round(self.getAverageSpeed());
        statEntry.throughput = _.filter(self.passedCars, function (timestamp) {
            return (Date.now() - timestamp) < 60000
        }).length;

        let currentFuelConsumption = Math.round(_.reduce(self.cars, function(sum, car :Car) { return sum + car.fuelConsumption}, 0)) + this.fuelConsumptionByDeadCars;
        statEntry.fuelConsumption =  Math.max(Math.round((currentFuelConsumption - this.fuelConsumptionCounter) / Math.max(self.cars.length, 1) / 100), 0);
        this.fuelConsumptionCounter = currentFuelConsumption;
        self.stats.push(statEntry)

        let sparklines = [ 'averageSpeed', 'activeCarCount', 'throughput', 'fuelConsumption'];
        _.each(sparklines, function (id) {
            $("#" + id).text(statEntry[id]);
            
            $("." + id + "sparkline").sparkline(
                _.map(self.stats, function (s:Statentry) {
                    return s[id]
                }).splice(-50)
            );
        })

        $("#crashes").text(self.crashCounter);

    }

    removeAllCars() {
        _.each(this.cars, function (car:Car) {
            car.svgObj.remove()
        })
        this.cars = [];
    }
}

export function run() {

    let main = new Main();
    main.init();

    main.update();

    
    $('[data-toggle="tooltip"]').tooltip()

    $('#start').on('click', function () {
        main.addCar()
    });

    $('#reset').on('click', function () {
        main.removeAllCars()
    })

    $('#toggle-size').on('click', function () {
        main.removeAllCars()
        if (main.meterToPixel == 4) {
            main.meterToPixel = 8
        } else {
            main.meterToPixel = 4
        }
    })

    $('#debugMode').on('change', function () {
        if ($('#debugMode').prop('checked')) {
            $('body').addClass("debugMode");
        } else {
            $('body').removeClass("debugMode");
        }
    });
}