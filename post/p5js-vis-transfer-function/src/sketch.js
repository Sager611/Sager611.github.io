// define your LTI transfer function here!
// plotter.add_tf(tf, Nverticals, Nhorizontals, stepX, stepY, end, line_step, extra_opts)
function add_transfer_function(operations) {
    let tf;
    try {
        tf = new LTITF(operations);
    } catch(err) {
        alert("Invalid H(s): " + operations);
        return;
    }
    // remove all previous transfer functions
    plotter.clear();
    //plotter.add_tf(tf, 1, 0, 1, 1, 1e8, 0.5, { distr: 'expo', expo_N: 50 });
    plotter.add_tf(tf, 21, 21, 1, 1, 9, 0.2);
    plotter.interpolate_end_t = 12; // in secs
    plotter.interpolate_tol = 1e-8;
    plotter.interpolate_vel = 1.25;
    update_plot();
}

function submit_transfer_function() {
    const operations = $('#transfer_function').val();
    add_transfer_function(operations);
}

function OLD_transfer_function() {
  let tf;

  // {
  //   tf = new LTITF('s');
  //   plotter.add_tf(tf, 21, 21, 1, 1, 9, 0.1);
  // }

  {
//     tf = new LTITF('2.718281828459^s');
//     plotter.add_tf(tf, 21, 21, 1, 1, 9, 0.2);

//     plotter.interpolate_end_t = 20; // in secs
//     plotter.interpolate_tol = 1e-8;
  }

  {
    tf = new LTITF('10/(s*(1+s/.8)*(1+s/15)*(1+s/125))')
    // plotter.add_tf(tf, 1, 0, 1, 1, 100, 0.1);
    // higher expo_N means more points close to the origin
    // distr: 'expo' is perfect for nichols' plots!
    // in 'expo', lower line_step means more focus on points near the origin,
    //   and higher line_step gives more focus on points near the extrema.
    //   line_step has to be in (0, 1)
    plotter.add_tf(tf, 1, 0, 1, 1, 1e8, 0.5, { distr: 'expo', expo_N: 50 });
    plotter.interpolate_end_t = 12; // in secs
    plotter.interpolate_tol = 1e-8;
    plotter.interpolate_vel = 1.25;
  }

  {
    // tf = new LTITF('(2^s + 3)/(0.02*s - 1) + 1.0');
    // plotter.add_tf(tf, 1, 0, 1, 1, 1000, 0.25);
  }

  {
//     scale_factor = 10e14;

//     tf = new LTITF('1000*2^((s-4)*(s-4.5))');
//     plotter.add_tf(tf, 1, 0, 1, 1, 9.7, 0.0025);
//     plotter.interpolate_end_t = 140; // in secs
//     plotter.interpolate_tol = 1e-8;
  }

  {
    // tf = new LTITF('1/((s+1)^2)');
    // // plotter.add_tf(tf, 5, 0, 0.33, 1, 100, 0.1);
    // plotter.add_tf(tf, 5, 0, 0.33, 1, 100, 0.9, {distr:'expo', expo_N:20});
    // plotter.interpolate_end_t = 30; // in secs
    // plotter.interpolate_tol = 1e-10;
  }
}

// Width and Height of the screen
let doc = document,
    body = doc.getElementsByTagName('body')[0],
    W = window.innerWidth || doc.documentElement.clientWidth || body.clientWidth,
    H = window.innerHeight|| doc.documentElement.clientHeight|| body.clientHeight;
H -= 240;
//W -= 10;
//const W = 1000, H = 1000;
// modify this to see a better graph. Higher means smaller graph.
let scale_factor = 10;
let prev_scale_factor = scale_factor;

// size of the buffered image to plot to, compared to (W, H)
const scale_lim = 2;

let scaleX, scaleY, transX, transY;
let offX = 0, offY = 0, totalOffX=0, totalOffY=0, prevOffX = 0, prevOffY = 0;

let plotter;

// BUTTONS
//let button_polar;
//let button_nichols;
//let button_input;

function update_plot() {
  const sc = prev_scale_factor / scale_factor;
  totalOffX += offX;
  totalOffY += offY;
  totalOffX *= sc;
  totalOffY *= sc;
  prev_scale_factor = scale_factor;

  plotter.offX = totalOffX;
  plotter.offY = totalOffY;
  plotter.scale_factor = scale_factor;
  plotter._update_buffer();

  offX = 0;
  offY = 0;
  prevOffX = 0;
  prevOffY = 0;
}

function getMouseX() {
  return (mouseX / W) * scale_factor / prev_scale_factor;
}

function getMouseY() {
  return (mouseY / H) * scale_factor / prev_scale_factor;
}

function setup() {
  LTITF.setup();

  plotter = new Plotter();
  add_transfer_function('(s^2/10 - 1) * (s / 10)');
  update_plot();

  // BUTTONS (OLD)
  //button_polar = createButton('Polar');
  //// button_polar.position(0, 0);
  //button_polar.mousePressed(
    //() => plotter.interpolate('polar')
  //);
  //button_nichols = createButton('Nichols');
  //button_nichols.mousePressed(
    //() => plotter.interpolate('nichols')
  //);
  //button_input = createButton('Input');
  //button_input.mousePressed(
    //() => plotter.interpolate('input')
  //);

  const canv = createCanvas(W, H);
  canv.mousePressed(canvasMousePressed);
  canv.mouseReleased(canvasMouseReleased);
}

let avg_dt = 0.016;
function draw_info(dt) {
  const scale_str = 'scale: ' + nf(scale_factor, "", 4);
  const offsetX_str = 'offsetX: ' + nf(totalOffX*prev_scale_factor+offX*prev_scale_factor, "", 4);
  const offsetY_str = 'offsetY: ' + nf(totalOffY*prev_scale_factor+offY*prev_scale_factor, "", 4);
  avg_dt = avg_dt*(0.99) + dt*0.01;
  const fps_str = nf(1/avg_dt, 1, 1) + ' FPS';
  const max_str_len = max(fps_str.length, max(scale_str.length, max(offsetX_str.length, offsetY_str.length)));

  resetMatrix();
  translate(20, 20);
  fill(0, 0, 0, 18);
  noStroke();
  rect(0, 0, 9*max_str_len, 100);
  fill(255);
  textSize(18);
  text(scale_str, 10, 20);
  text(offsetX_str, 10, 40);
  text(offsetY_str, 10, 60);
  text(fps_str, 10, 80);
}

let last_t = Date.now();
function draw() {
  // Complex.drawTest();

  let dt = min(1/5, max(1/120, (Date.now() - last_t) / 1000));
  last_t = Date.now();

  // update //

  plotter.update(dt);

  ////////////

  background(0);
  resetMatrix();
  scale(W, H);

  let sc = prev_scale_factor / scale_factor;
  scale(sc, sc);
  translate(0.5 / sc, 0.5 / sc); // center
  translate(offX, offY); // offset

  plotter.draw();

  draw_info(dt);
}


// CONTROLS //
function notInCanvas() {
    const mx=getMouseX(), my=getMouseY();
    return mx < 0 || my < 0 || mx > W || my > H;
}

function check_borders() {
  const sc = prev_scale_factor / scale_factor;
  return abs(offX) > scale_lim/4 + (sc-1)/sc/2 || abs(offY) > scale_lim/4 + (sc-1)/sc/2;
}

function mouseWheel(event) {
  if (notInCanvas())
    return;

  // increase/decrease scale
  scale_factor *= pow(1.12, event.delta / 16);

  if (prev_scale_factor / scale_factor > scale_lim || check_borders()) {
    update_plot();
  }

  // print('prev: '+prev_scale_factor+' curr: '+scale_factor);

  return false;
}

let prevMouseX, prevMouseY;

function canvasMousePressed() {
  prevMouseX = getMouseX();
  prevMouseY = getMouseY();
}

function canvasMouseReleased() {
  prevOffX = offX;
  prevOffY = offY;
}

function mouseDragged() {
  if (notInCanvas())
    return;

  offX = prevOffX + getMouseX() - prevMouseX;
  offY = prevOffY + getMouseY() - prevMouseY;

  if (check_borders()) {
    update_plot();
    prevMouseX = getMouseX();
    prevMouseY = getMouseY();
  }
}

function keyPressed() {
  if(key == ' ') {
    // reset
    if(keyIsDown(CONTROL)) {
      scale_factor = 1.0;
    }
    offX = 0;
    offY = 0;
    totalOffX = 0;
    totalOffY = 0;

    update_plot();
  } else if(keyCode == CONTROL) {
    // totalOffX = floor(totalOffX*prev_scale_factor)/prev_scale_factor;
    // totalOffY = floor(totalOffY*prev_scale_factor)/prev_scale_factor;
  }
}
