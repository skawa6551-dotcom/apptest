// ============================================================

// workspace.js

// Records Workspace

// ============================================================

class Workspace {

  constructor() {

    this.container = null;

    this.isOpened = false;

  }

  create() {

    if (this.container) return;

    this.container = document.createElement("section");

    this.container.id = "workspace";

    this.container.className = "workspace";

    this.container.hidden = true;

    this.container.innerHTML = `

      <header class="workspace-header">

        <h1 class="workspace-title">

          Records

        </h1>

        <div class="workspace-actions">

          <button

            id="viewModeBtn"

            class="icon-btn"

            aria-label="鑑賞モード">

            👁

          </button>

          <button

            id="lockNowBtn"

            class="icon-btn"

            aria-label="今すぐロック">

            🔒

          </button>

        </div>

      </header>

      <main class="workspace-grid">

        <button

          class="workspace-card"

          data-page="records">

          <span class="card-icon">📝</span>

          <h2>Records</h2>

          <p>Ask AI</p>

        </button>

        <button

          class="workspace-card"

          data-page="schedule">

          <span class="card-icon">📅</span>

          <h2>Schedule</h2>

          <p>Events</p>

        </button>

        <button

          class="workspace-card"

          data-page="files">

          <span class="card-icon">📁</span>

          <h2>Files</h2>

          <p>Documents</p>

        </button>

        <button

          class="workspace-card"

          data-page="locations">

          <span class="card-icon">📍</span>

          <h2>Locations</h2>

          <p>Places</p>

        </button>

        <button

          class="workspace-card"

          data-page="settings">

          <span class="card-icon">⚙️</span>

          <h2>Settings</h2>

          <p>Preferences</p>

        </button>

      </main>

    `;

    // appの後ろへ追加（なければbodyへ）

    const appRoot = document.getElementById("app");

    if (appRoot) {

      appRoot.after(this.container);

    } else {

      document.body.appendChild(this.container);

    }

  }

  open() {

    if (!this.container) return;

    this.isOpened = true;

    this.container.hidden = false;

    requestAnimationFrame(() => {

      this.container.classList.add("is-open");

    });

    // 自動ロックタイマーをリセット

    if (window.resetAutoLockTimer) {

      window.resetAutoLockTimer();

    }

  }

  close() {

    if (!this.container) return;

    this.isOpened = false;

    this.container.classList.remove("is-open");

    setTimeout(() => {

      this.container.hidden = true;

    }, 250);

    // 自動ロックタイマー停止

    if (window.stopAutoLockTimer) {

      window.stopAutoLockTimer();

    }

  }

  toggle() {

    if (this.isOpened) {

      this.close();

    } else {

      this.open();

    }

  }

  isOpen() {

    return this.isOpened;

  }

  getElement() {

    return this.container;

  }

}

export default new Workspace();