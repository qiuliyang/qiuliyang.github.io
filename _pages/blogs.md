---
layout: archive
title: "Blogs"
permalink: /blogs
author_profile: true
---

{% if author.googlescholar %}
  You can also find my articles on <u><a href="{{author.googlescholar}}">my Google Scholar profile</a>.</u>
{% endif %}

{% if site.url %}
  {% assign base_path = site.url | append: site.baseurl %}
{% else %}
  {% assign base_path = site.github.url %}
{% endif %}

{% for post in site.blogs reversed %}
  {% include archive-single.html %}
{% endfor %}