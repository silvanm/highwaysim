import { Car } from "./Car";
import * as _ from "lodash";

declare var Snap:any;

class Statentry {
    activeCarCount:number = 0;
    averageSpeed:number = 0;
    throughput:number = 0;
}

class Main {

    svg:any;

    cars:Car[] = [];

    lastCarId:number = 0;

    roadLengthPixel:number;

    lanes:number = 2;

    // Stores the average speed history. Used to display the sparklines
    stats:Statentry[] = [];

    // Stores the timestamps when cars have passed the track.
    // Used to calculate the throughput
    passedCars:number[] = [];

    crashCounter:number = 0;


    public static meterToPixel = 8;

    public static widthOfLane:number = 3;


    init() {

        this.svg = Snap("#svg");
        this.roadLengthPixel = $('#svg').width()

        let self = this;
        window.setInterval(function () {
            self.updateStats()
        }, 1000);

        _.each(['cars-per-minute', 'reaction-time', 'speed', 'speed-variance'], this.initSlider);

        this.launchCar()
    }

    initSlider(sliderName:string) {
        $('#' + sliderName).slider({ tooltip: 'hide' })
        $('#' + sliderName).on("slide", function(slideEvt) {
            $("#" + sliderName + "-display").text(slideEvt.value);
        });
        $("#" + sliderName + "-display").text(
            $('#' + sliderName).slider().data('slider').getValue()
        );
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
            car.svgObj.attr('x', car.position * Main.meterToPixel - Car.dimensions.length * Main.meterToPixel);
            car.svgObj.attr('y', car.lane * Main.widthOfLane * Main.meterToPixel);

            if (car.stateColors[car.state] == 'red') {
                car.svgObj.attr('href', 'img/car_braking.png?a=3')
            } else if (car.stateColors[car.state] == 'lightred') {
                car.svgObj.attr('href', 'img/car_action.png?a=3')
            } else {
                car.svgObj.attr('href', 'img/car_normal.png?a=2')
            }

            // Removing cars which have passed the full track
            if (car.position * Main.meterToPixel - Car.dimensions.length * Main.meterToPixel > self.roadLengthPixel) {
                car.svgObj.remove();
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
        //console.log(carDistances);

    }

    addCar() {

        let self = this;

        let car = new Car(this.lastCarId);
        car.reactionTime = $('#reaction-time').slider().data('slider').getValue();
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
                car.position * Main.meterToPixel - Main.meterToPixel,
                (car.lane) * Main.meterToPixel * Main.widthOfLane - 15,
                50,
                50);
            window.setTimeout(function () {
                explosionSvg.remove();
            }, 1000);

        };
        this.cars.push(car);

        car.svgObj = this.svg.image("img/car_normal.png?a=2",
            0,
            12,
                Car.dimensions.length * Main.meterToPixel,
                Car.dimensions.length * Main.meterToPixel
            )
            .hover(function () {
                car.manualBraking();
            })
            .click(function () {
                car.manualBraking();
            })
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
        self.stats.push(statEntry)
        $("#average_speed").text(statEntry.averageSpeed);
        $(".speedsparkline").sparkline(
            _.map(self.stats, function (s:Statentry) {
                return s.averageSpeed
            }).splice(-50)
        );

        $("#active_car_count").text(statEntry.activeCarCount);
        $(".active_car_count_sparkline").sparkline(
            _.map(self.stats, function (s:Statentry) {
                return s.activeCarCount
            }).splice(-50)
        );

        $("#througput").text(statEntry.throughput);
        $(".throughput_sparkline").sparkline(
            _.map(self.stats, function (s:Statentry) {
                return s.throughput
            }).splice(-50)
        );

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
    //var notedetector = new Notedetector(context);

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
}