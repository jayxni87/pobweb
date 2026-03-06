// PoBWeb - Entry point
const worker = new Worker('js/engine/worker.js', { type: 'module' });

worker.onmessage = (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'result':
      console.log('Calc result:', payload);
      break;
    case 'error':
      console.error('Worker error:', payload);
      break;
  }
};

export function sendToWorker(type, payload) {
  worker.postMessage({ type, payload });
}
