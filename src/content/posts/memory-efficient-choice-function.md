---
title: "Memory efficient numpy.random.choice()"
description: "NumPy’s numpy.random.choice() method samples items at random from an array."
date: "2023-05-23T15:02:50+02:00"
tags: ["Numpy", "Complexity", "Algorithm"]
---

<style>.algo-container { margin: auto; margin-top: 2em; margin-bottom: 2em; width: 90%; } .algo-hr-top { height:3px; } .algo-hr-mid { height:1px; } .algo-hr-bottom { height:3px; } .lemma { margin: auto; margin-top: 2em; margin-bottom: 2em; width: 90%; overflow-x:auto; } .lemma-qed { margin-left:95%; }</style>

NumPy’s [`numpy.random.choice()`](https://numpy.org/doc/1.24/reference/random/generated/numpy.random.choice.html) method samples items at random from an array.

Unfortunately, sampling *without* replacement an `int` from $0$ to $N-1$ requires $O(N)$ memory. Thus, the following code will result in an OOM error (if not completely crash your machine):

```python
import numpy as np

N = 1_000_000_000_000
np.random.choice(N, size=2, replace=False)
```

This is because `numpy.random.choice()` creates (at least up to NumPy version 1.24) an array of size $N$ (in our example, ~465 GB !), as it can be seen in the [source code](https://github.com/numpy/numpy/blob/1e8b589033e1ce2add835840ccdc259e5e1fa4d0/numpy/random/mtrand.pyx#L841):

```python
    def choice(self, a, size=None, replace=True, p=None):

        ...

                # pop_size == a when `a` is an `int`
                idx = self.permutation(pop_size)[:size]

        ...

        if a.ndim == 0:
            return idx


    def permutation(self, object x):

        ...

        if isinstance(x, (int, np.integer)):
            # this creates an array of size `x`
            arr = np.arange(x)
            self.shuffle(arr)
            return arr
```

However, intuitively we shouldn’t need to create an array of size $N$ if we are sampling a small amount of items $k$, right?

We could simply keep sampling *with* replacement (which doesn’t require $O(N)$ memory) until we have an array of $k$ different items.

This very basic and straightforward algorithm would be defined as follows:

* * *

**Algorithm 1** An algorithm to draw without replacement. $k>0$ items are taken without replacement from a universe of size $N$. $choice(N, k)$ samples $k$ items with replacement with a space complexity of $O(k \log{N})$:

* * *

**Require:** $N \geq (2 + \sqrt{2}) \cdot k$

1:   $X \leftarrow \{choice(N,1)\}$  
2:   **while** $\vert X\vert \neq k$ **do**  
3:     $s \leftarrow choice(N, 1)$  
4:     **if** $s \notin X$ **then**  
5:       $X \leftarrow X \cup \left\{ s \right\}$  
6:     **end if**  
7:   **end while**  

* * *

Which in code looks like,

```python
def choice(N: int, k: int = 1, replace: bool = True, p=None):
    """Sample `k` elements from 0 to `N-1` with or without replacement."""
    if not replace and N >= 3.414213562373095 * k:
        X = [np.random.choice(N, size=1, replace=True, p=p)]
        X = set(X)
        while len(X) != k:
            s = np.random.choice(N, size=1, replace=True, p=p)
            X.add(s)
        return X
    else:
        return np.random.choice(N, size=k, replace=replace, p=p)
```

But why require that $N \geq (2 + \sqrt{2})\cdot k$? We will figure it out by proving a couple of theorems:

**Theorem 1**  Algorithm 1 *has a space complexity of $O(k \log{N})$*.  
  
*Proof.* Both $X$ and $choice(N, k)$ occupy $O(k \log{N})$ space, since $\vert X\vert$ is at most $k$ and our largest number, $N$, requires $O(\log{N})$ bits to be stored.

$\square$

This one was very simple. But, how about time complexity?

**Theorem 2**  Algorithm 1 *has an expected time complexity of $O(k)$, i.e., it has a time complexity of $\Theta(k)$*.  
  
*Proof.* In order to advance in the while loop, we need to add new elements to $X$. Thus:

$$
\begin{align}
  P\left[\text{sampling unique item after }i+1\text{ draws}\right] &= \left(\frac{\vert X\vert}{N}\right)^i \cdot \left( 1 - \frac{\vert X\vert}{N} \right) \\
   &\leq \left(\frac{k-1}{N}\right)^i \cdot 1
  \end{align}
$$

Using this probability bound, the expected number of items drawn is:

$$
\begin{align}
    \mathbb{E}[\text{\# of items drawn}] \leq 1 &+ \mathbb{E}[\text{\# of draws to increment }\vert X\vert=1\text{ by 1}] \\
                                         &+ \cdots \\
                                         &+ \mathbb{E}[\text{\# of draws to increment }\vert X\vert=(k-1)\text{ by 1}] \\
                                          \leq 1 &+ (k-1)\sum_{i=1}^\infty i\left(\frac{k-1}{N}\right)^{i}
  \end{align}
$$

Since we have to draw 1 item in line 1 of the algorithm and then we have to draw $(k-1)$ new unique items in the while loop.

We now note that the algorithm requires that $N\geq (2 + \sqrt{2})\cdot k$, so:

$$
\begin{align}
  N \geq (2 + \sqrt{2}&)\cdot k \geq 2\cdot k \newline
  \frac{k-1}{N} &\leq 2^{-1} \newline
  &\downarrow \newline
  \mathbb{E}[\text{\# of items drawn}] &\leq 1 + (k-1) \sum_{i=1}^\infty i\cdot2^{-i} \newline
                                           &= 1 + (k-1)\cdot 2 \newline
                                           &= O(k)
  \end{align}
$$

$\square$

Note that sets in Python have $O(1)$ lookup and insert times, required for lines 4 and 5 in the algorithm.

However, this is not all. We have used the fact that $N \geq 2k$ in our proof, but now let’s generalize to $N \geq ak$ with $a > 1$. Note that $a=1$ would include the possibility that $N=k$, in which we just sample all items in the universe of size $N$, and this is not interesting for our purposes. Also, $a<1$ includes cases where $N<k$, which is impossible and our algorithm would not halt.

**Lemma 1**  *If $N\geq ak$ for $a>1$, the expected number of items drawn is less than $1 + (k-1)\cdot a/(a-1)^2$*.  
  
*Proof.* $N\geq ak$ implies that,

$$
\begin{align}
  \frac{k-1}{N} &\leq a^{-1} \\
                &\downarrow \\
  \mathbb{E}[\text{\# of items drawn}] &\leq 1 + (k-1) \sum_{i=1}^\infty i\cdot a^{-i} \\
                &= 1 + (k-1)\frac{a}{(a-1)^2}
  \end{align}
$$

Since,

$$
\sum_{i=1}^\infty i\cdot a^{-i} = \frac{a}{(a-1)^2} \qquad \forall a, \vert a\vert > 1
$$

$\square$

With this lemma we can prove the following theorem:

**Theorem 3**  Algorithm 1 *draws O(2k) items w.p.* (with probability) *less than $(k-1)/N$*.  
  
*Proof.* We define $Y := (\text{\# of items drawn} - 1)$, which is the amount of items drawn in the while loop. We recall [Markov's inequality](https://en.wikipedia.org/wiki/Markov%27s_inequality):

$$
P\left[ Y \geq \delta\cdot \mathbb{E}[Y] \right] \leq \frac{1}{\delta} \qquad \delta > 0
$$

So that, using Lemma 1,

$$
P\left[ Y \geq \delta\cdot (k-1) \cdot \frac{a}{(a-1)^2} \right] \leq P\left[ Y \geq \delta\cdot \mathbb{E}[Y] \right] \leq \frac{1}{\delta}
$$

Now, we set $\delta = N/(k-1)$, and consider the maximum value of $a$, $a^*=N/k$,

$$
P\left[ Y \geq N \cdot \frac{a^*}{(a^*-1)^2} \right] \leq \frac{k-1}{N}
$$

Note that this is true since Lemma 1 still applies when $a=a^*$. We now observe that,

$$
N \frac{a^*}{(a^*-1)^2} = k\frac{N^2}{(N-k)^2} = k\left( 1 - \frac{k}{N}\right)^{-2}
$$

Thus finally,

$$
P\left[ Y \geq k\cdot\left(1-\frac{k}{N}\right)^{-2} \right] \leq \frac{k-1}{N}
$$

We can now apply our algorithm requirement $N \geq (2 + \sqrt{2})\cdot k$ so we get,

$$
N \geq \left(2 + \sqrt{2}\right)\cdot k \quad \rightarrow \quad \left(1-\frac{k}{N}\right)^{-2} \leq \left(1-\frac{1}{2 + \sqrt{2}}\right)^{-2} = 2
$$

Thus, in the worst case we always draw $O(1+2k)=O(2k)$ items w.p. less than $(k-1)/N$.

$\square$

This is very useful. It means that if $N$ is massive and $k$ is minuscule in comparison, we won’t draw more than $1+2k$ items with high probability. In fact, if $N$ is 100 times $k$, then we will draw $1+1.021\cdot k$ items w.p. less than ~1%.

This is definitely better than the original algorithm, which when creating the array of length $N$ had to spend $O(N)$ time.

To end this little exploration, note that in general if we had chosen $\delta=N/(k-1)k^\gamma$ for some $\gamma>0$, then we would have that the algorithm is $O\left(1+k^{1+\gamma}\left(1-\frac{k}{N}\right)^{-2}\right)$ w.p. less than $k^{1-\gamma}/N$.

For example, the algorithm is $O(k^2)$ w.p. less than $1/N$. This means that drawing 10 items without replacement from a universe of 1'000 items using this algorithm will require drawing 103 items w.p. less than 0.1%.

Example use-case
----------------

But, when do we have a massive $N$ in practice?

Let me present the original problem I was trying to solve which required me to create my own *choice* function: a memory-efficient implementation to sample without replacement [`itertools.product()`](https://docs.python.org/3/library/itertools.html#itertools.product).

Let’s say that you have multiple iterables that can be indexed in Python and you want to sample $k$ random permutations of their items.

Since the space of all permutations is prohibitively large, we cannot simply generate *all* permutations first and then sample $k$ of them.

The solution is to use our $choice(N, k)$ function:

```python
def random_product(*iterables, size: int = None) -> tuple:
    """Memory efficient way to sample ``itertools.product`` at random without replacement."""
    lens = [len(it) for it in iterables]
    # N is usually extremely large!
    N = np.prod(lens)
    if size is None:
        size = N
    idx = np.unravel_index(choice(N, k=size, replace=False),
                           shape=lens)
    idx = np.array(idx).T
    for i_ in idx:
        yield tuple(iterables[i][i_[i]] for i in range(len(iterables)))
```
