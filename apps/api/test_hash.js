const bcrypt = require('bcryptjs');
console.log(bcrypt.compareSync('Investor@123', '$2a$12$x6S0jWnhh5KbKqPyiXaRPeHEuWEIuWoXx6o2M1r6wLwUYladvbQhC'));
