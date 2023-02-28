function Complex(r, i) {
  this.r = r;
  this.i = i;
}

Complex.prototype.x = function () { return this.r; }
Complex.prototype.y = function () { return this.i; }
Complex.prototype.copy = function() { return new Complex(this.r, this.i); }

// Operations.
// i == in-place

Complex.prototype.add = function (z) {
  return new Complex(this.r + z.r, this.i + z.i);
}

Complex.prototype.sub = function (z) {
  return new Complex(this.r - z.r, this.i - z.i);
}

Complex.prototype.addi = function (z) {
  this.r += z.r;
  this.i += z.i;
  return this;
}

Complex.prototype.subi = function (z) {
  this.r -= z.r;
  this.i -= z.i;
  return this;
}

Complex.prototype.mul = function (z) {
  switch(z.constructor) {
    case Number:
      return new Complex(
        this.r*z,
        this.i*z
      );
    case Complex:
      return new Complex(
        this.r*z.r - this.i*z.i,
        this.i*z.r + this.r*z.i
        );
  }
}

Complex.prototype.muli = function (z) {
  switch(z.constructor) {
    case Number:
      this.r *= z;
      this.i *= z;
      return this;
    case Complex:
      let r = this.r;
      this.r = r*z.r - this.i*z.i;
      this.i = this.i*z.r + r*z.i;
      return this;
  }
}

Complex.prototype.dot = function (z) {
  return this.r * z.r + this.i * z.i;
}

Complex.prototype.cross = function (z) {
  return this.r * z.i - this.i * z.r;
}

Complex.prototype.arg = function () {
  const alpha = atan2(this.i, this.r);
  if(alpha<0)
    return alpha+2*PI;
  return alpha
}

Complex.prototype.len2 = function () {
  return this.r*this.r + this.i*this.i;
}

// Here we go..
Complex.prototype.div = function (z) {
  const z2 = z.len2();
  return new Complex(
    this.dot(z) / z2,
    z.cross(this) / z2
  );  
}

Complex.prototype.divi = function (z) {
  const z2 = z.len2();
  const new_r = this.dot(z) / z2;
  this.i = z.cross(this) / z2;
  this.r = new_r;
  return this;
}

// Yayy
Complex.prototype.pow = function (z) {
  const c = new Complex(log(this.len2())/2, this.arg());
  c.muli(z);
  const l = exp(c.r);
  c.r = l * cos(c.i);
  c.i = l * sin(c.i);
  return c;
}

Complex.prototype.powi = function (z) {
  let log_l = log(this.len2())/2;
  this.i = this.arg();
  this.r = log_l;
  this.muli(z);
  let l = exp(this.r);
  this.r = l * cos(this.i);
  this.i = l * sin(this.i);
  return this;
}

// returns the magnitude in dB
Complex.prototype.dB = function () {
  return log(this.len2()) * 4.342944819;
}

Complex.prototype.draw = function () {
  line(0, 0, this.r, this.i);
}

let _initTest=false;
let _z0, _z1, _z2, _z3;
Complex.drawTest = function() {
  background(0);
  center_drawing();
  draw_origin();
  if(_initTest == false || mouseIsPressed) {
    _initTest = true;
    if(mouseIsPressed){
      _z0 = new Complex(getMouseX(), getMouseY());
    } else {
      _z0 = new Complex(1, 1);
      _z1 = new Complex(1, 2);
    }
    _z2 = _z0.mul(_z1);
    _z3 = _z2.div(_z1);
  }
  stroke(255);
  _z0.draw();
  _z1.draw();
  stroke(0, 200, 200);
  _z2.draw();
  stroke(200, 0, 0);
  _z3.draw();
}

Complex.op = function(l, op, r) {
  if(!(l instanceof Complex) || !(r instanceof Complex)) {
    throw '[Complex - op] ERROR: the objects given: '+l+' and '+r+' are not complex.';
  }
  switch(op) {
    case '+':
      return l.add(r);
    case '-':
      return l.sub(r);
    case '*':
      return l.mul(r);
    case '/':
      return l.div(r);
    case '^':
      return l.pow(r);
    default:
      print('[Complex - op] ERROR: unknown operator "'+op+'".');
      return new Complex(0, 0);
  }   
}

Complex.opi = function(l, op, r) {
  if(!(l instanceof Complex) || !(r instanceof Complex)) {
    throw '[Complex - op] ERROR: the objects given: '+l+' and '+r+' are not complex.';
  }
  switch(op) {
    case '+':
      return l.addi(r);
    case '-':
      return l.subi(r);
    case '*':
      return l.muli(r);
    case '/':
      return l.divi(r);
    case '^':
      return l.powi(r);
    default:
      print('[Complex - op] ERROR: unknown operator "'+op+'".');
      return new Complex(0, 0);
  }   
}

