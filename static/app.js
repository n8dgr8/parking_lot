class DebugConsole {
    constructor() {
        this.console = document.getElementById('debug-console');
        this.content = document.getElementById('debug-content');
        this.isVisible = false;
        this.maxEntries = 100;
        this.setupKeyboardListener();
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.console.classList.toggle('visible');
    }

    log(message, type = 'info') {
        if (!this.content) return; // In case debug console isn't in the DOM
        
        const entry = document.createElement('div');
        entry.className = `debug-entry ${type}`;
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        const content = document.createElement('span');
        content.className = 'content';
        content.textContent = message;
        entry.appendChild(timestamp);
        entry.appendChild(content);
        this.content.appendChild(entry);
        while (this.content.children.length > this.maxEntries) {
            this.content.removeChild(this.content.firstChild);
        }
        this.console.scrollTop = this.console.scrollHeight;
    }

    error(message) { this.log(message, 'error'); }
    warning(message) { this.log(message, 'warning'); }

    setupKeyboardListener() {
        document.addEventListener('keydown', (event) => {
            if (event.key === '`' || event.key === '~') {
                if (this.console) this.toggle();
            }
        });
    }
}

class FirebaseManager {
    constructor(debugConsole, onStateUpdated, onStatusChanged) {
        this.projectId = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) || "your-gcp-project-id";
        this.db = null;
        this.debug = debugConsole;
        this.onStateUpdated = onStateUpdated; 
        this.onStatusChanged = onStatusChanged; 
        this.initialize();
    }

    initialize() {
        try {
            this.onStatusChanged('reconnecting');
            this.debug.log(`Initializing Firebase for project: ${this.projectId}`);
            if (!firebase.apps.length) {
                firebase.initializeApp({ projectId: this.projectId });
            }
            this.db = firebase.firestore();
            this.debug.log('Firebase initialized. Setting up real-time listener...');
            this.setupListener();
        } catch (error) {
            this.debug.error(`Firebase init error: ${error.message}`);
            this.onStatusChanged('disconnected');
        }
    }

    setupListener() {
        this.db.collection("spots").doc("state").onSnapshot(
            (doc) => {
                this.onStatusChanged('connected');
                const spots = [];
                const data = doc.exists ? doc.data() : {};

                for (let i = 1; i <= 4; i++) {
                    const spotKey = `spot${i}`;
                    const spotData = data[spotKey] || { status: 'unoccupied', timestamp: Date.now() };
                    spots.push({
                        id: spotKey,
                        status: spotData.status,
                        timestamp: spotData.timestamp
                    });
                }
                this.onStateUpdated(spots);
            },
            (error) => {
                this.debug.error(`Firestore error: ${error.message}`);
                this.onStatusChanged('disconnected');
            }
        );
    }
}
