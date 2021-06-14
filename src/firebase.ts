const admin = require("firebase-admin");
const serviceAccount = require("../firebase_key/modelion-key.json");
const http = require("http");

export default class FirebaseWorker {
    id = 1;
    db: any;

    constructor() {}

    async start() {
            console.log("Start Firebase Connection");
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            this.db = admin.firestore();
            this.startWorker();
    }

    async startWorker() {
        const orders = await this.fetchOrders();
        if (orders.length > 0) {
            const firstFreeOrder = orders[0];
            this.apply(firstFreeOrder);
        } else {
            const unsub = this.db.collection("orders").onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        unsub();
                        this.startWorker();
                    }
                })
            });
        }
    }

    async fetchOrders() {
        const ref = this.db.collection("orders").orderBy("timestamp", "desc");
        const snapshot = await ref.get();
        const openOrders = snapshot.docs
            .map((doc) => {
                return {
                    data: doc.data(),
                    id: doc.id,
                };
            })
            .filter((doc) => {
                return !doc.data.worker;
            });
        return openOrders;
    }

    // Returns true if this worker gets this order, false if it didnt
    async apply(order) {
        console.log("Creating Application for free Order");
        const application = {
            timestamp: new Date().getTime(),
            worker: this.id,
            orderId: order.id,
        };
        await this.db.collection("applications").add(application);
        const unsub = this.db
            .collection("orders")
            .doc(application.orderId)
            .onSnapshot(async (snapshot) => {
                const order = snapshot.data();
                if (order.worker) {
                    unsub();
                    console.log("Worker Zuteilung ist geschehen - jetzt kann der Main-Prozess gestartet werden.");
                    await this.mainTask();
                    this.startWorker();
                }
            });
    }

    async mainTask() {
        const sleep = (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        await sleep(5000);
    }
}
