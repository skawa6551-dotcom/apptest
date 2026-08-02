// ============================================================

// records.js

// Records Screen

// v0.7.0

// ============================================================

class Records {

    constructor() {

        this.container = null;

        this.isOpened = false;

    }

    create() {

        if (this.container) return;

        this.container = document.createElement("section");

        this.container.id = "records";

        this.container.className = "records";

        this.container.hidden = true;

        this.container.innerHTML = `

<header class="records-header">

<button

type="button"

class="icon-btn"

data-action="close-records"

aria-label="戻る">

←

</button>

<h1>Records</h1>

<button

type="button"

class="icon-btn"

id="archiveBtn"

aria-label="Archive">

📂

</button>

</header>

<main class="records-body">

<div class="records-intro">

<h2>Quick Question</h2>

<p>

メモや質問を入力できます。

送信後は画面から消えます。

</p>

</div>

<div

id="recordsMessages"

class="records-messages">

</div>

<div class="records-input-area">

<textarea

id="recordsInput"

placeholder="入力..."

rows="3">

</textarea>

<button

type="button"

id="recordsSendBtn"

data-action="send-records">

送信

</button>

</div>

</main>

`;

        document.body.appendChild(this.container);

    }

    open() {

        if (!this.container) return;

        this.isOpened = true;

        this.container.hidden = false;

        requestAnimationFrame(() => {

            this.container.classList.add("is-open");

        });

    }

    close() {

        if (!this.container) return;

        this.isOpened = false;

        this.container.classList.remove("is-open");

        setTimeout(() => {

            this.container.hidden = true;

        },250);

    }

    addMessage(text) {

        const list = document.getElementById("recordsMessages");

        if (!list) return;

        const item = document.createElement("div");

        item.className = "records-message";

        item.textContent = text;

        list.appendChild(item);

    }

    clearMessages() {

        const list = document.getElementById("recordsMessages");

        if (list) {

            list.innerHTML = "";

        }

    }

    getInputValue() {

        const input = document.getElementById("recordsInput");

        return input ? input.value : "";

    }

    clearInput() {

        const input = document.getElementById("recordsInput");

        if (input) {

            input.value = "";

        }

    }

    isOpen() {

        return this.isOpened;

    }

}

export default new Records();