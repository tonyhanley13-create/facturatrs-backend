const bcrypt = require('bcryptjs');
const hash = '$2a$10$R/P5yQeawq4MEFNjtnbd7uVzA.fNAwS7d05k6Xnbs0CmfEXsQUkhm';
console.log('Hash length:', hash.length);
console.log('Hash:', hash);
console.log('Kibalion2:', bcrypt.compareSync('Kibalion2', hash));
console.log('1212:', bcrypt.compareSync('1212', hash));
console.log('KIBALION2:', bcrypt.compareSync('KIBALION2', hash));
console.log('kibalion2:', bcrypt.compareSync('kibalion2', hash));
