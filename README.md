# SIMPLE HIGHWAY SIMULATOR #

Online version at http://muehlemann.com/highwaysim

This little app is a simple simulator of cars on a highway. Play with the parameters or stop any car by touching it. As a game try to maximize the throughput by playing with the parameters. It will show you why traffic will become much more performant once everyone drives self-driving cars.
            
### What's the point? ###
There are many reasons that I built this app: I was in my vacations in Spain with my family. Some like tanning on the beach or reading books. I like coding. It's an interesting challenge. It gives me some programming practice (I am mostly manager). And the result is a app my kids (6 and 8 years old) also enjoy playing with.

### Tech infos ###
Typescript, SVG and a simple state machine for each car. The code is not very pretty. And edge cases are not handled well. And it performs badly on low-CPU devices. Memory leaks? Probably yes.

### Install ###

* Install dependencies via ```bower install```  and ```npm install```
* Compile the code via ```tsc```