import {BrainStoreElem} from './Main'

// Responsible for storing and displaying the statistics for each brain

export class Brainstats {

    brainStore: BrainStoreElem[];

    elem: any;

    constructor(brainStore: BrainStoreElem[], locator: string) {
        this.elem = $(locator);
        this.brainStore = brainStore;
    }

    draw() {
        let html = '<table class="table">';
        html += `<tr><th>Brain-ID</th><th>Car-ID</th><th>Action</th><th>Collisions</th><td>Completions</td><td>Reward</td></tr>`
        this.brainStore.forEach((e: BrainStoreElem) => {
            html += `<tr><th>${e.id}</th>`
            if (e.car === null) {
                html += `<td></td><td></td>`
            } else {
                html += `<td>${e.car.id}</td><td>${e.car.action}</td>`
            }
            html += `<td>${e.collisions}</td><td>${e.completions}</td><td>${e.rewards}</td></tr>`
        })
        html += '</table>';
        this.elem.html(html)
    }
}
