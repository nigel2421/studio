import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 1000,
  duration: '30m',
};

export default function () {
  http.get('http://localhost:9002/dashboard');
  sleep(1);
}
