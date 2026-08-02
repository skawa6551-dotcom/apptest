// ============================================================

// router.js

// Records Router

// v0.7.0

// ============================================================

import Workspace from "./workspace.js";

import Records from "./records.js";

function hideCalculator() {

    const app = document.getElementById("app");

    if (app) {

        app.hidden = true;

    }

}

function showCalculator() {

    const app = document.getElementById("app");

    if (app) {

        app.hidden = false;

    }

}

function openWorkspace() {

    hideCalculator();

    Workspace.open();

}

function closeWorkspace() {

    Workspace.close();

    showCalculator();

}

function openRecords() {

    Workspace.close();

    Records.open();

}

function closeRecords() {

    Records.close();

    Workspace.open();

}

export default {

    openWorkspace,

    closeWorkspace,

    openRecords,

    closeRecords

};