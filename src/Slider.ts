/**
 * Created by silvan.muehlemann on 19.10.16.
 */

export interface Slideroptions {

    name:string;
    label:string;
    step:number;
    value:number;
    max:number;
    unitlabel:string;
    helptext?:string;

}

export class Slider {

    options:Slideroptions

    constructor(options:Slideroptions) {
        this.options = options;
    }

    addToDom(selector:string) {

        let element = $('<div class="form-group ">'
            + '<label for="' + this.options.name + '" class="col-sm-4 control-label">' + this.options.label
            + ' <span class="glyphicon glyphicon-info-sign" data-toggle="tooltip" data-placement="top" '
            + 'title="' + this.options.helptext + '"></span></label>'
            + '<div class="col-sm-8">'
            + '<input id="' + this.options.name + '" data-slider-id="' + this.options.name + '-slider" type="text"'
            + 'data-slider-min="0" data-slider-max="' + this.options.max + '" data-slider-step="' + this.options.step + '"'
            + 'data-slider-value="' + this.options.value + '"/>'
            + '<span id="' + this.options.name + '-display"></span> ' + this.options.unitlabel
            + '</div></div>');

        $(selector).append(element);

        let self = this;

        $('#' + this.options.name).slider({tooltip: 'hide'})
        $('#' + this.options.name).on("slide", function (slideEvt) {
            $("#" + self.options.name + "-display").text(slideEvt.value);
        });
        $("#" + this.options.name + "-display").text(
            $('#' + self.options.name).slider().data('slider').getValue()
        );
    }
}