---
title: "Visualizing transfer functions in p5.js"
description: "In 2020 I was following lectures on automatic control and learned about the transfer function of a system and ways to visualize it, at which point I was curious so I went ahead and wrote a simple visualizer for generic transfer functions."
date: "2023-02-27T16:51:17+01:00"
tags: ["P5js", "Control Theory"]
---

<style>.resizer { display:flex; margin:0; padding:0; resize:vertical; overflow:hidden } .resizer > .resized { flex-grow:1; margin:0; padding:0; border:0 } .ugly { background:red; border:4px dashed black; } .visualizer { width: 100%; height: 800px; }</style>

In 2020 I was following lectures on [automatic control](https://didattica.polito.it/pls/portal30/gap.pkg_guide.viewGap?p_cod_ins=06LSLLM&p_a_acc=2020&p_header=S&p_lang=IT&multi=N) and learned about the [transfer function](https://en.wikipedia.org/wiki/Transfer_function) of a system and ways to visualize it, at which point I was curious so I went ahead and wrote a simple visualizer for generic transfer functions.

You can [jump ahead to the visualizer](#visualizer).

Setup
-----

The basic idea is that we can build a system with a feedback loop that takes an input signal $x(t)$ and outputs another signal $y(t)$ :

<figure><div class="flex justify-center"><div class="w-100"><img alt="" src="/post/p5js-vis-transfer-function/simple-feedback.svg" loading="lazy" data-zoomable=""></div></div></figure>

We then focus on [linear time-invariant (LTI)](https://en.wikipedia.org/wiki/Linear_time-invariant_system) transformations, which in a few words are those which take as input $e(t)$ and output $y(t) = (e \ast h)(t)$ , where $h(t)$ is called the [impulse response](https://en.wikipedia.org/wiki/Impulse_response) since it is exactly the value of the output $y(t)$ if our input where an impulse $e(t)=\delta(t)$ .

In the Laplace function space, the convolution of our transformation becomes a multiplication $Y(s) = H(s)E(s)$ .

Let’s plug in our $H(s)$ in the feedback loop!

We recursively apply it so we end up with:

$$
\begin{align*}
Y(s) &= \left( H(s) + H(s)^2 + H(s)^3 + \dots \right) \cdot X(s) \\
     &= \frac{H(s)}{1 - H(s)} \cdot X(s)
\end{align*}
$$

Visualizer
----------

Note that if our $H(s)$ touches the value 1 we’ll end up with an $\infty$ , oops.

So, when designing $H(s)$ we want to make sure that it is some distance away from 1.

But $H: \mathbb{C} \rightarrow \mathbb{C}$ , how can we visualize it?

Well, there are multiple approaches and this is where I got curious and decided to write a visualizer in [p5.js](https://editor.p5js.org/adriansagerlaganga/full/9CeBgb-Pv). I included a cartesian plot and a [Nichols plot](https://en.wikipedia.org/wiki/Nichols_plot). Other common plots include [Bode](https://en.wikipedia.org/wiki/Bode_plot) and [Nyquist](https://en.wikipedia.org/wiki/Nyquist_plot).

I also included a simple [abstract syntax tree (AST)](https://en.wikipedia.org/wiki/Abstract_syntax_tree) parser and traversal so you can write any $H(s)$ you want and see what happens!

You can try it out right here:

<iframe class="visualizer" src="./src/index.html"></iframe>

Controls:

<p><svg class="article-icon" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons/heroicons.svg#move"></use></svg>Drag to move around.</p>

<p><svg class="article-icon" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons/heroicons.svg#zoom"></use></svg>Mouse wheel to zoom in/out.</p>

<p><svg class="article-icon" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons/heroicons.svg#reset"></use></svg>Space to reset offset.</p>

> [!warning]
> You may encounter some bugs if you introduce incorrect $H(s)$ and the visualizer may crash. Use with care.
