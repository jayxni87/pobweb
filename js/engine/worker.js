// PoBWeb - Calculation engine Web Worker
self.onmessage = (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'calculate':
      // TODO: implement
      self.postMessage({ type: 'result', payload: {} });
      break;
    default:
      self.postMessage({ type: 'error', payload: { message: `Unknown message type: ${type}` } });
  }
};
