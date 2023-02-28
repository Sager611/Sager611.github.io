// splits an expression like '(s+1.0) / (s*s+s)' into symbols ['(', 's', '+', '/', '1.0']
const symbol_regex = /[0-9.]+|s|z|\+|\-|\(|\)|\/|\*|\^/g;
const number_regex = /^(s|z|[0-9.]+)$/;
const symbolic_number_regex = /^(s|z)$/;
const start_grouping_regex = /^(\(|\[)$/;
const finish_grouping_regex = /^(\)|\])$/;
// from less priority to more priority
const op_priority = [
  '+',
  '-',
  '*',
  '/',
  '^'
];

function SymNode(sym, p_level) {
  this.sym = sym;
  this.is_number = number_regex.test(sym);
  this.is_symbolic_number = symbolic_number_regex.test(sym);
  this.left = null;
  this.right = null;
  this.parent = this;
  // parenthesis level: no. of parenthesis groupings this symbol is in
  this.p_level = p_level;
}

SymNode.prototype.hasPriority = function(n) {
  if (!(n instanceof SymNode)) {
    print('[SymNode - hasPriority] ERROR: ' + n + ' is not a node.');
    return;
  }

  if (this.p_level < n.p_level) return false;
  if (this.p_level > n.p_level) return true;

  for (let i = 0; i < op_priority.length; i++) {
    if (this.sym == op_priority[i]) {
      return false;
    } else if (n.sym == op_priority[i]) {
      return true;
    }
  }
  // both are numbers
  return true;
}

// execute the tree using a complex number
SymNode.prototype.exec = function(c) {
  let left, right;

  if (this.is_symbolic_number) return c;
  if (this.is_number) return new Complex(parseFloat(this.sym), 0);

  if (this.left != null) left = this.left.exec(c);
  if (this.right != null) right = this.right.exec(c);

  return Complex.opi(left, this.sym, right);
}

SymNode.prototype.insert = function(n) {
  if (!(n instanceof SymNode)) {
    print('[SymNode - insert] ERROR: ' + n + ' is not a node.');
    return;
  }
  // print('inserting '+n.sym+' into '+this.sym);

  if (this.hasPriority(n)) {
    if (this.parent != this) {
      this.parent.right = n;
      n.parent = this.parent;
    }
    this.parent = n;
    n.left = this;

    return n;

  } else {
    if (this.left == null) {
      print('[SymNode - insert] ERROR: ' + this.sym + ' should not have an empty left node.');
    } else if (this.right == null) {
      this.right = n;
      n.parent = this;
    } else {
      // recurse
      this.right = this.right.insert(n);
    }
  }

  return this;
}

SymNode.prototype._print = function(l) {
  let spc = '';
  for (let i = 0; i < l; i++)
    spc += '  ';

  if (this.right != null) this.right._print(l + 1);
  print(spc + this.sym + '(' + this.p_level + ')');
  if (this.left !== null) this.left._print(l + 1);
}

// recursively print tree
SymNode.prototype.print = function() {
  print('Tree:');
  this._print(0);
}

function LTITF(str) {
  this.op_tree = null;
  // for plotting
  // this._cache == {"verticals": [[Complex...], ...], "horizontals": [[Complex...], ...]}
  this._cache = {
    "verticals": [],
    "horizontals": [],
    "out": []
  };
  this.parse(str);
}

// parses an expression like '(s+1.0) / (s*s+s)'
LTITF.prototype.parse = function(expr) {
  print('parsing ' + expr);
  this.expr = expr;

  let p_level = 0;
  let subtrees = [];
  const symbols = expr.match(symbol_regex);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    // print('p_level:'+p_level+' i:'+i+' symbol: '+symbol);
    if (start_grouping_regex.test(symbol)) {

      p_level++;
      subtrees[p_level] = null;

    } else if (finish_grouping_regex.test(symbol)) {

      p_level--;
      if (subtrees[p_level] == null) {
        subtrees[p_level] = subtrees[p_level + 1];
      } else {
        subtrees[p_level] = subtrees[p_level].insert(subtrees[p_level + 1]);
      }

    } else if (subtrees[p_level] == null) {
      subtrees[p_level] = new SymNode(symbol, p_level);
    } else {
      subtrees[p_level] = subtrees[p_level].insert(new SymNode(symbol, p_level));
    }
  }

  this.op_tree = subtrees[0];
  if (this.op_tree == null) {
    throw 'ERROR: Could not parse. check the expression of your transfer function.';
  }

  print('Done!');
  // this.op_tree.print();
}

// execute Symbolic Node graph
LTITF.prototype.exec = function(c) {
  if (!(c instanceof Complex)) {
    print('[LTITF - exec] ERROR: c is not a complex number: ' + c);
    return new Complex(0, 0);
  }

  return this.op_tree.exec(new Complex(c.r, c.i));
}

// returns the output of the input set
LTITF.prototype.out = function(input) {
  if (!(input instanceof Array))
    throw 'ERROR: input should be an Array';
  
  if (input._LTITF_cache != null && input._LTITF == this && this._cache.out[input._LTITF_cache] != null)
    return this._cache.out[input._LTITF_cache];

  input._LTITF_cache = this._cache.out.length;
  input._LTITF = this;
  const cachei = input._LTITF_cache;
  this._cache.out[cachei] = [];
  for (let i = 0; i < input.length; i++)
    this._cache.out[cachei][i] = this.exec(input[i]);
  
  return this._cache.out[cachei];
}

const _uniform_lines = function(tf, horiz, start, finish, end, step, line_step, lines, {distr, expo_N}) {
  const c  = new Complex(0, 0);
  const c2 = new Complex(0, 0);
  let count = 0;
  for (c.r = start; c.r < finish; c.r += step, count++) {
    lines[count] = [];
    switch(distr) {
      case 'exponential':
      case 'expo':
        line_step = max(min(line_step, 0.99999), 0.00001);
        const N = int(expo_N/(1-line_step));
        let i;
        for (c.i = -end, i=0; i < N; i++, c.i *= line_step) {
          if (horiz)
          {  c2.r=c.i; c2.i=c.r; }
          else
          {  c2.r=c.r; c2.i=c.i; }
          lines[count].push(tf.exec(c2));
        }
        
        const line_step_inv = 1/line_step;
        for (c.i = -c.i, i=0; i <= N; i++, c.i *= line_step_inv) {
          if (horiz)
          {  c2.r=c.i; c2.i=c.r; }
          else
          {  c2.r=c.r; c2.i=c.i; }
          lines[count].push(tf.exec(c2));
        }

        break;
      default:
        for (c.i = -end; c.i <= end; c.i += line_step) {
          if (horiz)
          {  c2.r=c.i; c2.i=c.r; }
          else
          {  c2.r=c.r; c2.i=c.i; }
          lines[count].push(tf.exec(c2));
        }
    }
  }
}

// returns the output in the complex plane of providing a 
// 'grid' as input, where a 'grid' is a set of parallel
// horizontal and vertical lines.
LTITF.prototype.out_grid = function(N_verticals, N_horizontals, stepX, stepY, end, line_step, { distr, expo_N=10 }) {
  if (N_verticals == null) N_verticals = 10;
  if (N_horizontals == null) N_horizontals = 10;
  if (stepX == null) stepX = 1;
  if (stepY == null) stepY = 1;
  if (end == null) end = 500;
  if (line_step == null) line_step = 0.5;
  if (distr == null) distr = 'linear';
 
  if (this._cache.verticals.length == N_verticals && this._cache.horizontals.length == N_horizontals &&
      this._cache.end == end && this._cache.line_step == line_step)
    return this._cache;

  this._cache.end = end;
  this._cache.line_step = line_step;
  
  if (end < 0)
    throw 'ERROR: "end" cannot be negative: ' + end;

  switch(distr) {
    case 'exponential':
    case 'expo': {
      const n_points = expo_N * 2 / (1 - line_step) * (N_verticals + N_horizontals);
      if (n_points > 100000)
        throw 'ERROR: too many points! ' + n_points;
      break;
    }
    default: {
      const n_points = end * 2 / line_step * (N_verticals + N_horizontals);
      if (n_points > 100000)
        throw 'ERROR: too many points! ' + n_points;
    }
  }
      
  const startX = -floor(N_verticals / 2) * stepX;
  const finishX = ceil(N_verticals / 2) * stepX;

  this._cache.verticals = [];

  _uniform_lines(this, false, startX, finishX, end, stepX, line_step, this._cache.verticals, {distr, expo_N});

  const startY = -floor(N_horizontals / 2) * stepY;
  const finishY = ceil(N_horizontals / 2) * stepY;

  this._cache.horizontals = [];

  _uniform_lines(this, true, startY, finishY, end, stepY, line_step, this._cache.horizontals, {distr, expo_N});

  return this._cache;
}

LTITF.setup = function() {
  LTITF.identity = new LTITF('s');

  // test
  // let res = LTITF.identity.out([new Complex(0, 0), new Complex(1, 1), new Complex(-1, 1), new Complex(10, -1)]);
  // res.forEach(c => print('res', c.r, c.i));
}