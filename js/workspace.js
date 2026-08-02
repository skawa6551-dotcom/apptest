// workspace.js

class Workspace {

  constructor() {

    this.container = null;

    this.isOpened = false;

  }

  create() {

    this.container = document.createElement("section");

    this.container.id = "workspace";

    this.container.className = "workspace";

    this.container.hidden = true;

    this.container.innerHTML = `

      <header class="workspace-header">

        <h1>Records</h1>

        <button id="lockNowBtn" class="lock-btn">

          🔒

        </button>

      </header>

      <main class="workspace-grid">

        <button class="workspace-card" data-records="notes">

          <span>📝</span>

          <h2>Records</h2>

          <p>Quick ideas</p>

        </button>

        <button class="workspace-card">

          <span>📅</span>

          <h2>Schedule</h2>

        </button>

        <button class="workspace-card">

          <span>📁</span>

          <h2>Files</h2>

        </button>

        <button class="workspace-card">

          <span>📍</span>

          <h2>Locations</h2>

        </button>

        <button class="workspace-card">

          <span>⚙️</span>

          <h2>Settings</h2>

        </button>

      </main>

    `;

    document.body.appendChild(this.container);

  }

  open() {

    this.isOpened = true;

    this.container.hidden = false;

  }

  close() {

    this.isOpened = false;

    this.container.hidden = true;

  }

  isOpen() {

    return this.isOpened;

  }

}

export default new Workspace();