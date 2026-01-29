import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '40s',
};

export default function () {
  http.get('http://localhost:9002/dashboard');
  sleep(1);
}
