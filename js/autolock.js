// ============================================================

// autolock.js

// Records Auto Lock

// v0.7.0

// ============================================================

const AUTO_LOCK_TIME = 5 * 60 * 1000;

let timer = null;

let callback = null;

function clearTimer() {

    if (timer !== null) {

        clearTimeout(timer);

        timer = null;

    }

}

function start() {

    clearTimer();

    timer = setTimeout(() => {

        if (typeof callback === "function") {

            callback();

        }

    }, AUTO_LOCK_TIME);

}

function reset() {

    start();

}

function stop() {

    clearTimer();

}

function setHandler(fn) {

    callback = fn;

}

function getRemaining() {

    return timer;

}

export default {

    start,

    reset,

    stop,

    setHandler,

    getRemaining

};