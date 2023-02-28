function Plotter() {
  this.img = createGraphics(scale_lim * W, scale_lim * H);
  // transfer functions
  this.tfs = [];
  // input lines
  this.input_lines = [];
  // set of lines to plot
  this.lines = [];
  // set of destination lines
  this.dest_lines = [];
  // input points
  this.input_points = [];
  // set of points
  this.points = [];
  // set of destination points
  this.dest_points = [];
  // interpolation
  this.plot = 'input';
  this.interpolating = false;
  this.interpolate_t = 0;
  this.interpolate_end_t = 10;
  this.interpolate_tol = 1e-6;
  // points to skip when interpolating
  this.interpolate_skip = 3;
  this.interpolate_vel = 0.5;

  // transform values
  this.offX = 0;
  this.offY = 0;
  this.transX = 0;
  this.transY = 0;
  this.scaleX = 1;
  this.scaleY = 1;
  this.scale_factor = 1;

  this._update_buffer();
}

Plotter._copy_line = function(line) {
  let new_line = [];
  line.forEach(z => {
    switch(z.constructor) {
      case Number:
        new_line.push(z);
        break;
      case Complex:
        new_line.push(z.copy());
        break;
    }
  });
  return new_line;
}

Plotter.prototype.add_tf = function(tf, N_verticals, N_horizontals, stepX, stepY, end, line_step, extra_opts={}) {
  this.tfs.push(tf);
  // add a grid input
  const out_grid = LTITF.identity.out_grid(N_verticals, N_horizontals, stepX, stepY, end, line_step, extra_opts);
  out_grid.verticals.forEach( line => {
    this.input_lines.push(line);
    this.input_lines[this.input_lines.length-1].tf = tf; // store the tf per-line
    this.lines.push(Plotter._copy_line(line));
    this.lines[this.lines.length-1].tf = tf;             // store the tf per-line
  } );
  out_grid.horizontals.forEach( line => {
    this.input_lines.push(line);
    this.input_lines[this.input_lines.length-1].tf = tf;
    this.lines.push(Plotter._copy_line(line));
    this.lines[this.lines.length-1].tf = tf;
  } );
}

Plotter.prototype.clear = function() {
  this.tfs = [];
  this.lines = [];
  this.input_lines = [];
  this.dest_lines = [];
  this.points = [];
  this.input_points = [];
  this.dest_points = [];
  this._update_buffer();
}

// start interpolation to a specified plot
Plotter.prototype.interpolate = function(plot) {
  if(plot == null) plot = 'polar';

  this.interpolating = true;
  this.interpolate_t = 0;

  this.plot = plot;

  // if we are asked to go back to the input
  if(plot == 'input') {
    this.dest_lines = this.input_lines;
    return;
  }

  // first calculate the actual destination values
  this.dest_lines = [];
  this.input_lines.forEach( line => this.dest_lines.push( Plotter._copy_line(line.tf.out(line)) ) );

  // now modify them depending on the kind of plot
  switch(plot) {
    case 'cartesian':
      break;
    case 'nichols':
      const arglim=179;
      this.dest_lines.forEach( line => {
        let prev_r  = null;
        let arg_off = 0;
        line.forEach( c => {
          let new_r = arg_off + c.arg() * 57.29577951308; // to degrees
          if (prev_r != null && abs(new_r - prev_r) > arglim) {
            arg_off += (new_r - prev_r) > 0 ? -360 : 360;
            new_r += (new_r - prev_r) > 0 ? -360 : 360;
          }
          prev_r = new_r;
          c.i = c.dB();
          c.r = new_r;
      } ) } );
      break;
    // TODO: bode, ...
    default:
      print('[Plotter - interpolate] ERROR: '+plot+' is not a valid plot.');
  }
  // ...
}

Plotter.prototype._finish_interpolate = function() {
  this.interpolating = false;
  this.lines.forEach((line, linei) => {
    for (let ci = 0; ci < line.length; ci++) {
      line[ci] = this.dest_lines[linei][ci].copy();
    }
  });
  print('finished interpolation');
}

Plotter.prototype.update = function(dt) {
  if (this.interpolating) {
    if (this.lines.length != this.dest_lines.length)
      throw 'Cannot interpolate since the destination doesn\'t match';

    this.interpolate_t += dt;
    if (this.interpolate_t > this.interpolate_end_t) {
      this._finish_interpolate();
    } else {
      let maxdiff = 0;
      this.lines.forEach((line, linei) => {
        for (let ci = 0; ci < line.length; ci += this.interpolate_skip) {
          let diff = this.dest_lines[linei][ci].sub(line[ci]);
          line[ci].addi(diff.muli(dt * this.interpolate_vel));
          maxdiff = max(maxdiff, diff.len2());
        }
      });
      if(maxdiff < this.interpolate_tol) {
        this._finish_interpolate();
      }
    }

    this._update_buffer();
  }
}

Plotter.prototype._update_buffer = function() {
  this._update_transform();

  this._clear_drawing();
  this._center_drawing();

  this._draw_lines();

  this._draw_origin();
  this._draw_critical_point();
  // print('updated buffer: off:(' + this.offX + ', ' + this.offY + ') scale:'+this.scale_factor);
}

Plotter.prototype._update_transform = function() {
  this.scaleX = W / this.scale_factor;
  this.scaleY = -W / this.scale_factor;
  const centerX = scale_lim/2;
  const centerY = scale_lim/2;
  // these mark where (0, 0) will be
  this.transX = (this.offX + centerX) * W/this.scaleX;
  this.transY = (this.offY + centerY) * H/this.scaleY;
}

Plotter.prototype._clear_drawing = function() {
  this.img.background(100);
  this.img.resetMatrix();
}

Plotter.prototype._center_drawing = function() {
  this.img.scale(this.scaleX, this.scaleY);
  this.img.translate(this.transX, this.transY);
  this.img.strokeWeight(2 / this.scaleX);
}

Plotter.prototype._draw_origin = function() {
  this.img.stroke(200);
  this.img.line(0, -0.1, 0, 0.1);
  this.img.line(-0.1, 0, 0.1, 0);
}

Plotter.prototype._draw_critical_point = function() {
  this.img.stroke(240, 90, 20);
  switch(this.plot) {
    case 'nichols':
      this.img.line(180, -0.1, 180, 0.1);  // Y
      this.img.line(179.9, 0, 180.1, 0);  // X
      this.img.line(-180, -0.1, -180, 0.1);  // Y
      this.img.line(-180.1, 0, -179.9, 0);  // X
      break;
    case 'polar':
      this.img.line(-1, -0.1, -1, 0.1);  // Y
      this.img.line(-1.1, 0, -0.9, 0);  // X
      break;
    default:
  }
}

Plotter.prototype._draw_lines = function() {
  this.img.stroke(150);
  const skip = this.interpolating ? this.interpolate_skip : 1;
  this.lines.forEach( l => {
    let prev = null;
    for(let ci=0; ci<l.length; ci+=skip) {
      if(prev != null && max(abs(prev.r-l[ci].r),abs(prev.i-l[ci].i)) < scale_factor*10)
        this.img.line(prev.r, prev.i, l[ci].r, l[ci].i);

      prev = l[ci];
    }
  } );
}


// supposes that (0, 0) is the center of the screen
// and (0.5, 0.5) is the bottom-right corner of the
// visible screen.
Plotter.prototype.draw = function() {
  image(this.img, -0.5 * scale_lim, -0.5 * scale_lim, scale_lim, scale_lim);
}
