const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Kibalion2', 10);
console.log(hash);
