import * as _ from "lodash";
import {Car} from "../src/Car";


describe("Car", function () {

    jasmine.clock().install();
    jasmine.clock().mockDate();

    it("updates the position if we call Call.run()", function () {
        let car = new Car(1);


        // run at 50 km/h
        car.run(50);
        jasmine.clock().tick(1000);
        car.update();

        expect(Math.round(car.position)).toBe(Math.round(50 * 1000 / 3600))
    });

});