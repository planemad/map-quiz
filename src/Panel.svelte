<style>
	div {
		z-index: 2;
		width: 40%;
		height: 100vh;
		position: absolute;
	}
	@media (max-width: 600px) {
		div {
			width: 100%;
			top: 75%;
		}
	}

</style>

<div>
	<slot></slot>
</div>